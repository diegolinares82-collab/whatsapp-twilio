import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import twilio from "twilio";
import { conectarMongoDB } from "./db.js";
import  Mensaje  from "./models/Mensaje.js";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const fromWhats = process.env.TWILIO_WHATSAPP_FROM;

// Conexión a MongoDB
await conectarMongoDB();

// ?? Enviar mensaje
app.post('/enviar', async (req, res) => {
  try {
    const { numero, cuerpo, direccion } = req.body;

    if (!numero || !cuerpo || !direccion) {
      return res.status(400).json({ error: 'numero, cuerpo y direccion son requeridos' });
    }

    // Enviar mensaje por Twilio
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${numero}`,
      body: cuerpo
    });

    // Guardar en Mongo
    const nuevoMensaje = new Mensaje({ numero, cuerpo, direccion });
    await nuevoMensaje.save();

    res.json({ ok: true, message: 'Mensaje enviado y guardado', sid: message.sid });
  } catch (error) {
    console.warn(error);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});


// ?? Webhook para recibir mensajes entrantes
app.post("/webhook", async (req, res) => {
  const data = req.body;

  // Guardamos TODO lo que Twilio nos envía
  try {
    const {cliente, pedido} = parsePedido(data.Body)
    await Mensaje.create({
      numero: data.From || data.To || "desconocido",
      cuerpo: data.Body , cliente, pedido, // si no hay Body, guardamos todo el payload
      direccion: data.From ? "in" : "out",       // si viene From, es entrante; si no, puede ser nuestro envío
      estado: data.MessageStatus || "unknown",
      metadata: data
    });
    console.log("Webhook guardado:", data.MessageSid || "sin SID");
  } catch (err) {
    console.error("Error guardando webhook:", err.message);
  }

  // Respuesta al webhook de Twilio
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});


function parsePedido(texto) {
  const lineas = texto.split("\n").map(l => l.trim()).filter(Boolean);

  let cliente = null;
  const pedido = [];

  for (const linea of lineas) {
    // Cliente
    if (/cliente:/i.test(linea)) {
      const match = linea.match(/cliente:\s*(.+?)(pedido:|$)/i);
      if (match) cliente = match[1].trim();
      continue;
    }

    // Items tipo: "2 centro", "5 kilos de murillo"
    const matchCantidad = linea.match(/^(\d+)\s+(.*)$/i);
    if (matchCantidad) {
      let cantidad = parseInt(matchCantidad[1], 10);
      let resto = matchCantidad[2].toLowerCase();

      let unidad = "und";
      let producto = resto;

      if (resto.includes("kilo")) {
        unidad = "kilos";
        producto = resto.replace(/kilos?\s+de\s+/i, "").trim();
      }

      pedido.push({ producto, cantidad, unidad });
    }
  }

  return { cliente, pedido };
}







// ?? Listar mensajes (opcional)
app.get("/mensajes", async (req, res) => {
  const mensajes = await Mensaje.find().sort({ fecha: -1 }).limit(50);
  res.json(mensajes);
});

app.listen(process.env.PORT, () => {
  console.log(`?? Servidor corriendo en http://localhost:${process.env.PORT}`);
});
