const multer = require("multer");
const ApiError = require("../utils/ApiError");

const MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// A voice note, said into a phone on a site. Every phone records something
// different: Android gives webm/opus, an iPhone gives mp4/aac.
const ACCEPTED_VOICE = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac",
  "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/3gpp", "video/mp4", "video/webm",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ACCEPTED.has(file.mimetype)) {
      return cb(ApiError.badRequest("Upload a PDF or image (PNG/JPG/WEBP)"));
    }
    cb(null, true);
  },
});

const uploadReceipt = (field = "file") => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(ApiError.badRequest("File exceeds 10MB limit"));
      }
      return next(ApiError.badRequest(err.message));
    }
    if (err) return next(err);
    if (!req.file) return next(ApiError.badRequest("No file uploaded"));
    next();
  });
};

/** The same, for a spoken note. The browser adds ";codecs=opus" to the type. */
const voice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ACCEPTED_VOICE.has(String(file.mimetype).split(";")[0].trim())) {
      return cb(ApiError.badRequest("That is not a sound recording this can read."));
    }
    cb(null, true);
  },
});

const uploadVoice = (field = "file") => (req, res, next) => {
  voice.single(field)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(ApiError.badRequest(err.code === "LIMIT_FILE_SIZE" ? "That recording is over 10MB. Keep it short." : err.message));
    }
    if (err) return next(err);
    if (!req.file) return next(ApiError.badRequest("Nothing was recorded."));
    next();
  });
};

module.exports = { uploadReceipt, uploadVoice };
