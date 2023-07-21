
import app from "@/init";
import { registerEvent, updateData, getData, startStreamingSession } from "@/controllers/streaming_session_controller";
import express from "express";

const router = express.Router()

router.get('/status', getData);
router.get('/sync', registerEvent);
router.post('/update', updateData);
router.post('/start', startStreamingSession);

export default router;
