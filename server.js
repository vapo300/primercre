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
    //   HTML FINAL CORREGIDO
    // ===============================
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva tu cita</title>

  <style>
    body {
      background-color: #E3F2FD;
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 15px;
      color: #0D47A1;
      font-size: 16px;
      line-height: 1.5;
    }
    h1 { text-align: center; font-size: 24px; margin-bottom: 20px; }
    .font-controls { text-align: center; margin-bottom: 20px; }
    .font-controls button {
      background-color: #1976D2; color: white; border: none;
      padding: 12px 18px; margin: 0 8px; border-radius: 8px;
      font-size: 18px; cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .card {
      background: #FFFFFF; padding: 20px; border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15); margin-bottom: 20px;
    }
    .label { font-weight: bold; color: #0D47A1; }
    .value { margin-bottom: 12px; }
    .actions { text-align: center; margin-top: 20px; }
    .actions button {
      background-color: #1976D2; color: white; border: none;
      padding: 14px 20px; margin: 10px; border-radius: 10px;
      font-size: 18px; cursor: pointer; width: 80%; max-width: 300px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    #horarios button {
      background-color: #0D47A1;
      color: white;
      border: none;
      padding: 10px 15px;
      margin: 5px;
      border-radius: 8px;
      cursor: pointer;
    }
  </style>

  <script>
    function changeFontSize(delta) {
      const body = document.body;
      let current = parseFloat(window.getComputedStyle(body).fontSize);
      let newSize = current + delta;
      if (newSize < 12) newSize = 12;
      if (newSize > 28) newSize = 28;
      body.style.fontSize = newSize + "px";
    }

    async function cargarHorarios() {
      const fecha = new Date().toISOString().split("T")[0];

      const res = await fetch(\`/horarios-disponibles?fecha=\${fecha}\`);
      const data = await res.json();

      const contenedor = document.getElementById("horarios");
      contenedor.innerHTML = "";

      if (data.horas.length === 0) {
        contenedor.innerHTML = "<p>No hay horarios disponibles.</p>";
        return;
      }

      data.horas.forEach(hora => {
        const btn = document.createElement("button");
        btn.textContent = hora;
        btn.onclick = () => seleccionarHora(hora);
        contenedor.appendChild(btn);
      });
    }

    async function seleccionarHora(hora) {
      const confirmar = confirm(\`Has seleccionado la hora: \${hora}. ¿Deseas reservar la cita?\`);
      if (!confirmar) return;

      let motivo = prompt("¿Cuál es el motivo de la cita? (Ej: corte de pelo, afeitado...)");
      if (!motivo || motivo.trim() === "") motivo = "Acción para cliente";

      guardarCita(hora, motivo);
    }

    async function guardarCita(hora, motivo) {
      const res = await fetch("/confirmar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "${token}",
          hora: hora,
          motivo: motivo
        })
      });

      const data = await res.json();

      if (data.ok) {

        alert("Tu cita ha sido guardada correctamente. Ahora verás los detalles en WhatsApp.");

        const mensaje = encodeURIComponent(
          \`Hola ${cliente?.nombre}, tu cita ha sido reservada correctamente.\\n\\n\` +
          \`📅 Fecha: \${new Date().toISOString().split("T")[0]}\\n\` +
          \`⏰ Hora: \${hora}\\n\` +
          \`📝 Motivo: \${motivo}\\n\` +
          \`🏬 Centro: Tienda\\n\` +
          \`📍 Dirección: (sitio de tienda)\\n\` +
          \`📞 Teléfono: (teléfono de tienda)\\n\\n\` +
          \`Si necesitas cambiar la cita, responde a este mensaje.\`
        );

        window.location.href = \`https://wa.me/${cliente?.telefono}?text=\${mensaje}\`;

      } else {
        alert("Hubo un error guardando la cita. Inténtalo de nuevo.");
      }
    }

    function cancelarCita() {
      alert("Cancelar cita aún no implementado");
    }
  </script>
</head>

<body>
  <h1>Detalles de tu cita</h1>

  <div class="font-controls">
    <button onclick="changeFontSize(2)">A+</button>
    <button onclick="changeFontSize(-2)">A−</button>
  </div>

  <div class="card">
    <div class="value"><span class="label">Cliente:</span> ${cliente?.nombre || "Desconocido"}</div>
    <div class="value"><span class="label">Fecha:</span> (pendiente)</div>
    <div class="value"><span class="label">Hora:</span> (pendiente)</div>
    <div class="value"><span class="label">Motivo:</span> (pendiente)</div>
  </div>

  <div id="horarios"></div>

  <div class="actions">
    <button onclick="cargarHorarios()">Confirmar cita</button>
    <button onclick="cancelarCita()">Cancelar cita</button>
    <button onclick="window.location.href='https://wa.me/${cliente?.telefono}'">Volver a WhatsApp</button>
  </div>

</body>
</html>
`);
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
