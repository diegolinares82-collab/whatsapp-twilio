import mongoose from 'mongoose';

const mensajeSchema = new mongoose.Schema({
  numero: { type: String, required: true },
  cuerpo: { type: String, required: true },
  direccion: { type: String, required: true },  // ?? este es el que falta
  fecha: { type: Date, default: Date.now }
});

export default mongoose.model('Mensaje', mensajeSchema);

