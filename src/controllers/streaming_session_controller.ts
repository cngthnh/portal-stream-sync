import { Request, Response, NextFunction } from "express";
import { StreamingSession, createSession, getSession } from "@/models/streaming_session";
import { Client } from "@/models/client";
import { default as ErrorMessages } from "@/constants/error_messages";
import { default as Constants } from "@/constants/constants";
import { config } from "dotenv";
import { Jwt, JwtPayload, default as jwt } from "jsonwebtoken";
config();

function registerEvent(request: Request, response: Response, next: NextFunction) {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };

    const token = request.body.token;
    verifyToken(token, (error, decoded) => {
        if (error || !decoded) {
            response.status(404).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        if (!isJwtPayload(decoded)) {
            response.status(404).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        const sessionId = decoded.sessionId;
        const session = getSession(sessionId);
        if (!session) {
            response.status(404).send(ErrorMessages.SESSION_NOT_FOUND);
            return;
        }

        response.writeHead(200, headers);
        response.write(session.data);

        const clientId = Date.now();

        const client = {
            id: clientId,
            response
        };

        session.clients.push(client);

        request.on('close', () => {
            console.log(`${clientId} Connection closed`);
            session.clients = session.clients.filter((client: Client) => client.id !== clientId);
        });
    });
}

function getData(request: Request, response: Response) {
    return response.json({ clients: [] })
}

function broadcastData(session: StreamingSession, data: object) {
    session.clients.forEach(client => client.response.write(data))
}

async function updateData(request: Request, response: Response, next: NextFunction) {
    const token = request.body.token;
    const data = request.body.data;
    verifyToken(token, (error, decoded) => {
        if (error || !decoded) {
            response.status(404).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        if (!isJwtPayload(decoded)) {
            response.status(404).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        const sessionId = decoded.sessionId;
        const session = getSession(sessionId);
        if (!session) {
            response.status(404).send(ErrorMessages.SESSION_NOT_FOUND);
            return;
        }
        session.data = data;
        response.json(session.data)
        return broadcastData(session, session.data);
    })
}

function isJwtPayload(decoded: string | Jwt | JwtPayload): decoded is JwtPayload {
    if (!decoded || typeof decoded === 'string') {
        return false;
    }
    return 'iss' in decoded;
}

function verifyToken(token: string, callback: jwt.VerifyCallback) {
    const key = process.env.SIGN_KEY;
    if (!key) {
        return false;
    }
    jwt.verify(token, key, {
        algorithms: [Constants.TOKEN_ALGO as jwt.Algorithm],
        issuer: Constants.TOKEN_ISSUER
    }, callback);
}

async function startStreamingSession(request: Request, response: Response, next: NextFunction) {
    const key = process.env.SIGN_KEY;
    if (!key) {
        response.status(500).send(ErrorMessages.INTERNAL_ERROR);
        return false;
    }
    const currentTimeInSec = Math.floor(Date.now() / 1000);
    jwt.sign({
        sessionId: createSession(),
        iat: currentTimeInSec,
        nbf: currentTimeInSec,
        exp: currentTimeInSec + Constants.TOKEN_EXPIRED_TIME
    },
        key,
        {
            algorithm: Constants.TOKEN_ALGO as jwt.Algorithm,
            issuer: Constants.TOKEN_ISSUER
        }, function (error, encoded) {
            if (error) {
                response.status(500).send(ErrorMessages.INTERNAL_ERROR);
            } else {
                response.json({ token: encoded });
            }
        });
}

export {
    registerEvent,
    getData,
    updateData,
    startStreamingSession
}