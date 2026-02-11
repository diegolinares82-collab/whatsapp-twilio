import mongoose from 'mongoose';


const ItemSchema = new mongoose.Schema({
  producto: { type: String, required: true },
  cantidad: { type: Number, required: true },
}, { _id: false });

const mensajeSchema = new mongoose.Schema({
  numero: { type: String, required: true },
  cuerpo: { type: String, required: true },
  direccion: { type: String, required: true }, 
  cliente: { type: String },
  pedido: { type: [ItemSchema], default: [] }, // ?? este es el que falta
  fecha: { type: Date, default: Date.now }
});



export default mongoose.model('Mensaje', mensajeSchema);

