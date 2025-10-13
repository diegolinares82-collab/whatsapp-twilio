import mongoose from "mongoose";

export async function conectarMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("? Conectado a MongoDB");
  } catch (err) {
    console.error("? Error al conectar a MongoDB", err);
    process.exit(1);
  }
}
