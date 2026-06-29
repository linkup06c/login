const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// ================= MONGO =================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.error(err));

// ================= USER =================
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  name: String,
  avatar: String,

  profile: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// ================= R2 =================
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// ================= UPLOAD AVATAR =================
app.post("/upload-avatar", upload.single("file"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const ext = req.file.originalname.split(".").pop();

    const fileName = `avatars/${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        CacheControl: "public, max-age=31536000"
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    return res.json({
      success: true,
      url
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.status(500).json({ error: "Erro no upload R2" });
  }
});

// ================= REGISTER =================
app.post("/register", async (req, res) => {

  const {
    email,
    password,
    name,
    avatar,
    profile = {}
  } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Preencha todos os campos" });
  }

  try {

    const exists = await User.findOne({ email });

    if (exists) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hash,
      name,
      avatar,
      profile
    });

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        avatar: user.avatar,
        profile: user.profile
      }
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: "Erro interno"
    });

  }

});

// ================= LOGIN =================
app.post("/login", async (req, res) => {

  const { email, password } = req.body;

  try {

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: "Usuário não encontrado"
      });
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.status(401).json({
        error: "Senha inválida"
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET
    );

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        avatar: user.avatar,
        profile: user.profile
      }
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: "Erro interno"
    });

  }

});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
