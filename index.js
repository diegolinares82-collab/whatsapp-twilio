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

  if (!from || !body) {
    console.log("Webhook de estado u otro evento:", req.body);
    return res.send("<Response></Response>");
  }

  console.log(`Mensaje de ${from}: ${body}`);

  try {
    // Guardar mensaje entrante
    await Mensaje.create({
      direccion: "in",
      numero: from,
      cuerpo: body,
      estado: "received",
      metadata: req.body
    });

    // Responder automáticamente
    const respuesta = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: from,
      body: `Recibí tu mensaje: ${body}`
    });

    // Guardar respuesta
    await Mensaje.create({
      direccion: "out",
      numero: from,
      cuerpo: `Recibí tu mensaje: ${body}`,
      estado: respuesta.status,
      sid: respuesta.sid,
      metadata: respuesta
    });

  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
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
