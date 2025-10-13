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
  const from = req.body.From;
  const body = req.body.Body;

  // Solo guardar si es mensaje real
  if (from && body) {
    console.log(`Mensaje de ${from}: ${body}`);
    await Mensaje.create({
      numero: from,
      cuerpo: body,
      direccion: "in",
      estado: "received",
      metadata: req.body
    });

    // Responder opcionalmente
    try {
      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: from,
        body: `Recibí tu mensaje: ${body}`
      });
    } catch (err) {
      console.warn("Error enviando respuesta:", err.message);
    }
  } else {
    console.log("Evento no es mensaje:", req.body);
  }

  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});






// ?? Listar mensajes (opcional)
app.get("/mensajes", async (req, res) => {
  const mensajes = await Mensaje.find().sort({ fecha: -1 }).limit(50);
  res.json(mensajes);
});

app.listen(process.env.PORT, () => {
  console.log(`?? Servidor corriendo en http://localhost:${process.env.PORT}`);
});
