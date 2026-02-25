require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// SERVIR ARCHIVOS ESTÁTICOS (index.html bonito)
app.use(express.static("public"));

// ===============================
//   CONEXIÓN A SUPABASE
// ===============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY   // ← CORREGIDO AQUÍ
);

// ===============================
//   RUTA: CREAR CLIENTE (POST)
// ===============================
app.post("/clientes", async (req, res) => {
  try {
    const { nombre, telefono, email, notas, estado } = req.body;

    const { data, error } = await supabase
      .from("clientes")
      .insert([
        {
          nombre,
          telefono,
          email,
          notas,
          estado: estado || "activo"
        }
      ])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    console.error("Error creando cliente:", error);
    res.status(500).json({ error: "Error creando cliente" });
  }
});

// =======================================
//   RUTA: OBTENER TODOS LOS CLIENTES (GET)
// =======================================
app.get("/clientes", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("id", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error("Error obteniendo clientes:", error);
    res.status(500).json({ error: "Error obteniendo clientes" });
  }
});
// ===============================
//   RUTA: HORARIOS DISPONIBLES
// ===============================
app.get("/horarios-disponibles", async (req, res) => {
  try {
    // Si no llega fecha → usar la fecha de hoy
    let fecha = req.query.fecha;
    if (!fecha) {
      const hoy = new Date();
      fecha = hoy.toISOString().split("T")[0]; // YYYY-MM-DD
    }

    const diaSemana = new Date(fecha).getDay(); // 0=Domingo, 6=Sábado

    // CERRADO fines de semana
    if (diaSemana === 0 || diaSemana === 6) {
      return res.json({ horas: [], mensaje: "Cerrado los fines de semana" });
    }

    // Horario de pruebas (lunes a viernes)
    const mañanaInicio = 9;
    const mañanaFin = 14;
    const tardeInicio = 16;
    const tardeFin = 18;

    const generarHoras = (inicio, fin) => {
      const horas = [];
      for (let h = inicio; h < fin; h++) {
        horas.push(`${h.toString().padStart(2, "0")}:00`);
        horas.push(`${h.toString().padStart(2, "0")}:30`);
      }
      return horas;
    };

    const horasDisponibles = [
      ...generarHoras(mañanaInicio, mañanaFin),
      ...generarHoras(tardeInicio, tardeFin)
    ];

    res.json({ fecha, horas: horasDisponibles });

  } catch (error) {
    console.error("Error generando horarios:", error);
    res.status(500).json({ error: "Error generando horarios" });
  }
});


// IMPORTS NECESARIOS PARA LA SIGUIENTE RUTA
const fs = require("fs");
const path = require("path");

// ===============================
//   RUTA: MOSTRAR PÁGINA DE RESERVA
// ===============================
app.get("/reservar/:token", async (req, res) => {
  const { token } = req.params;

  try {
    // Buscar token
    const { data, error } = await supabase
      .from("tokens_reserva")
      .select("cliente_id, fecha_creacion")
      .eq("token", token)
      .single();

    if (error || !data) {
      return res.status(404).send("Token no válido o expirado.");
    }

    // Buscar cliente
    const { data: cliente } = await supabase
      .from("clientes")
      .select("nombre, telefono")
      .eq("id", data.cliente_id)
      .single();

    // Cargar HTML desde /public/index.html
    let html = fs.readFileSync(path.join(__dirname, "public/index.html"), "utf8");

    // Reemplazar variables dentro del HTML
    html = html
      .replace(/{{TOKEN}}/g, token)
      .replace(/{{CLIENTE_NOMBRE}}/g, cliente?.nombre || "Desconocido")
      .replace(/{{CLIENTE_TELEFONO}}/g, cliente?.telefono || "");

    res.send(html);

  } catch (err) {
    console.error("Error en /reservar:", err);
    res.status(500).send("Error interno del servidor");
  }
});

// ===============================
//   WEBHOOK DE WHATSAPP (GET)
// ===============================
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ===============================
//   WEBHOOK DE WHATSAPP (POST)
// ===============================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    res.sendStatus(200);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const text = message.text?.body || "";

    // Buscar cliente por teléfono
    let { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("telefono", from)
      .single();

    // Si no existe → crear cliente "Desconocido"
    if (!cliente) {
      const { data: nuevoCliente } = await supabase
        .from("clientes")
        .insert([{ nombre: "Desconocido", telefono: from, estado: "activo" }])
        .select()
        .single();

      cliente = nuevoCliente;
    }

    // Guardar mensaje recibido
    await supabase.from("mensajes").insert([
      {
        cliente_id: cliente.id,
        contenido: text,
        enviado_por: "cliente",
        tipo: "texto"
      }
    ]);

    // ============================================
    //   SI EL CLIENTE ES NUEVO → PEDIR NOMBRE
    // ============================================
    if (cliente.nombre === "Desconocido" && text.toLowerCase().includes("cita")) {
      await enviarMensaje(
        from,
        "Perfecto, ¿me dices tu nombre, apellido o el mote con el que podamos reconocerte?"
      );
      return;
    }

    // ============================================
    //   SI EL CLIENTE RESPONDE SU NOMBRE
    // ============================================
    if (cliente.nombre === "Desconocido" && !text.toLowerCase().includes("cita")) {

      await supabase
        .from("clientes")
        .update({ nombre: text })
        .eq("id", cliente.id);

      await enviarMensaje(from, `Gracias ${text}. Ya estás registrado.`);

      const token = Math.random().toString(36).substring(2, 12);

      await supabase.from("tokens_reserva").insert({
        cliente_id: cliente.id,
        token,
        usado: false
      });

      await enviarMensaje(
        from,
        `Perfecto ${text}, aquí tienes tu enlace para reservar tu cita:\nhttps://primercre.onrender.com/reservar/${token}`
      );

      return;
    }

    // ============================================
    //   SI EL CLIENTE DICE "cita" O "cancelar cita"
    // ============================================
    if (
      text.toLowerCase().includes("cita") ||
      text.toLowerCase().includes("cancelar cita") ||
      text.toLowerCase().includes("anular cita")
    ) {

      // Buscar token sin usar
      const { data: tokenExistente } = await supabase
        .from("tokens_reserva")
        .select("token, usado")
        .eq("cliente_id", cliente.id)
        .eq("usado", false)
        .maybeSingle();

      let token = tokenExistente?.token;

      // Si no existe → generar uno nuevo
      if (!token) {
        token = Math.random().toString(36).substring(2, 12);

        await supabase.from("tokens_reserva").insert({
          cliente_id: cliente.id,
          token,
          usado: false
        });
      }

      // Enviar enlace SIEMPRE
      await enviarMensaje(
        from,
        `Aquí tienes tu enlace para gestionar tu cita:\nhttps://primercre.onrender.com/reservar/${token}`
      );

      // Si pidió cancelar → enviar dirección
      if (text.toLowerCase().includes("cancelar")) {
        await enviarMensaje(
          from,
          "Información de la tienda:\n\n" +
          "🏬 Centro: Tienda\n" +
          "📍 Dirección: (sitio de tienda)\n" +
          "📞 Teléfono: (teléfono de tienda)\n\n" +
          "Desde el enlace puedes cancelar o modificar tu cita."
        );
      }

      return;
    }

  } catch (error) {
    console.error("Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ===============================
//   FUNCIÓN PARA ENVIAR MENSAJES
// ===============================
async function enviarMensaje(to, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          text: { body: text }
        })
      }
    );

    const data = await response.json();
    console.log("Respuesta de Meta:", data);

  } catch (error) {
    console.error("Error enviando mensaje:", error);
  }
}
