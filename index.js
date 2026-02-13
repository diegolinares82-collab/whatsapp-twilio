import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { conectarMongoDB } from "./db.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js"
import  Mensaje  from "./models/Mensaje.js";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
dayjs.extend(utc);
dayjs.extend(timezone);

app.use(cors()); // ?? permite todos los orígenes (ideal para pruebas)

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
    const {cliente, pedido} = parsearMensaje(data.Body)
    await Mensaje.create({
      numero: data.From || data.To || "desconocido",
      cuerpo: data.Body , cliente, pedido, // si no hay Body, guardamos todo el payload
      direccion: data.From ? "in" : "out",       // si viene From, es entrante; si no, puede ser nuestro envío
      estado: data.MessageStatus || "unknown",
      metadata: data
    });
    console.log("Webhook guardado:", data.MessageSid || "sin SID");
    console.log("CLIENTE ", cliente)
    console.log("PEDIDO", pedido)
  } catch (err) {
    console.error("Error guardando webhook:", err.message);
  }

  // Respuesta al webhook de Twilio
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});



function parsearMensaje(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l);

  let cliente = null;
  let pedido = [];

  // 1?? Cliente + primer pedido en la misma línea
  const primera = lineas[0];

  const matchCliente = primera.match(/cliente\s*:\s*(.+?)\s*pedido\s*:/i);
  if (matchCliente) {
    cliente = matchCliente[1].trim();
  }

  const restoPrimera = primera.split(/pedido:/i)[1];
  if (restoPrimera) {
    const itemsPrimera = parsearLinea(restoPrimera);
    pedido.push(...itemsPrimera);
  }

  // 2?? Resto de pedidos en las siguientes líneas
  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    const items = parsearLinea(linea);
    pedido.push(...items);
  }

  return { cliente, pedido };
}

function parsearLinea(linea) {
  const resultados = [];
  const regex = /(\d+)\s+([^\d]+)/g;
  let match;

  while ((match = regex.exec(linea)) !== null) {
    resultados.push({
      cantidad: parseInt(match[1], 10),
      producto: normalizarProducto(match[2])
    });
  }

  return resultados;
}

function normalizarProducto(nombre) {
  return nombre
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}







// ?? Listar mensajes (opcional)
app.get("/mensajes", async (req, res) => {
  const mensajes = await Mensaje.find().sort({ fecha: -1 }).limit(50);
  res.json(mensajes);
});


app.post("/reportes/inventario", async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.body;

    const inicio = dayjs.tz(fechaInicio, "America/Bogota").startOf("day").utc().toDate();
    const fin =  dayjs.tz(fechaFin, "America/Bogota").endOf("day").utc().toDate();

    // Ajuste para incluir todo el día
    fin.setHours(23, 59, 59, 999);

    const resultado = await Mensaje.aggregate([
      {
        $match: {
          fecha: { $gte: inicio, $lte: fin }
        }
      },
      { $unwind: "$pedido" },
      {
        $group: {
          _id: "$pedido.producto",
          total: { $sum: "$pedido.cantidad" }
        }
      },
      {
        $project: {
          _id: 0,
          producto: "$_id",
          total: 1
        }
      },
      { $sort: { producto: 1 } }
    ]);

    res.json({
      rango: { fechaInicio, fechaFin },
      inventario: resultado
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando inventario" });
  }
});


app.listen(process.env.PORT, () => {
  console.log(`?? Servidor corriendo en http://localhost:${process.env.PORT}`);
});
