
import app from "@/init";
import { registerEvent, updateData, getData, startStreamingSession, requestJoin } from "@/controllers/streaming_session_controller";
import express from "express";

const router = express.Router()

router.get('/status', getData);
router.get('/sync', registerEvent);
router.post('/update', updateData);
router.post('/start', startStreamingSession);
router.get('/request_join', requestJoin);

export default router;
