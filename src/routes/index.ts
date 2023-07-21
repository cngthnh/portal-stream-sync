import { default as streamingSessionRouter } from "@/routes/streaming_session.routes";
import { Express } from "express";

function route(app: Express) {
    app.use("/stream", streamingSessionRouter);
}

export default route;