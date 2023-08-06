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
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    };

    const token = request.query.token;
    if (typeof token !== 'string') {
        response.status(400).send(ErrorMessages.BAD_REQUEST);
        return;
    }
    verifyToken(token, (error, decoded) => {
        if (error || !decoded) {
            response.status(400).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        if (!isJwtPayload(decoded)) {
            response.status(400).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        const sessionId = decoded.sessionId;
        const session = getSession(sessionId);
        const clientId = Date.now();

        if (!session) {
            response.status(404).send(ErrorMessages.SESSION_NOT_FOUND);
            return;
        }

        response.writeHead(200, headers);
        response.write(`event: message\n`);
        response.write(`data: ${JSON.stringify({ ...session.data, clientId })}`);
        response.write("\n\n");

        const client = {
            id: clientId,
            current: 0,
            response
        };

        session.clients.push(client);

        request.on('close', () => {
            session.clients = session.clients.filter((client: Client) => client.id !== clientId);
        });
    });
}

function requestJoin(request: Request, response: Response) {
    const token = request.query.token;
    if (typeof request.query.clientId !== 'string') {
        return;
    }
    const clientId = parseInt(request.query.clientId);
    if (typeof token !== 'string') {
        response.status(400).send(ErrorMessages.BAD_REQUEST);
        return;
    }
    verifyToken(token, (error, decoded) => {
        if (error || !decoded) {
            response.status(400).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        if (!isJwtPayload(decoded)) {
            response.status(400).send(ErrorMessages.BAD_REQUEST);
            return;
        }
        const sessionId = decoded.sessionId;
        const session = getSession(sessionId);
        if (!session) {
            response.status(404).send(ErrorMessages.SESSION_NOT_FOUND);
            return;
        }

        getLatestTimeFromClients(session, clientId);
    });
}

function getLatestTimeFromClients(session: StreamingSession, clientId: number) {
    if (session.clients.length === 0) {
        return false;
    }
    session.clients = session.clients.filter(client => !client.response.closed);
    const filteredClients = session.clients.filter(client => client.id !== clientId);
    const index = Math.floor(Math.random() * filteredClients.length);
    const randomClient = filteredClients[index];
    if (!randomClient) {
        return;
    }
    randomClient.response.write(`event: client_join\n`);
    randomClient.response.write(`data: {}`);
    randomClient.response.write("\n\n");
    return true;
}

function getData(request: Request, response: Response) {
    return response.json({ clients: [] })
}

function broadcastData(session: StreamingSession, data: any, force: boolean) {
    if (force) {
        session.clients.forEach(client => {
            client.response.write(`event: message\n`);
            client.response.write(`data: ${JSON.stringify({ ...data, clientId: client.id, forceTime: undefined })}`);
            client.response.write("\n\n");
        });
    } else {
        session.clients.forEach(client => {
            const newCurrent = data.current * data.length / 100;
            const clientCurrent = client.current * data.length / 100;
            if (newCurrent - clientCurrent > 5) {
                client.response.write(`event: message\n`);
                client.response.write(`data: ${JSON.stringify({ ...data, clientId: client.id, forceTime: undefined })}`);
                client.response.write("\n\n");
            }
        });
    }
}

async function updateData(request: Request, response: Response, next: NextFunction) {
    const token = request.body.token;
    const data = request.body.data;
    const force = request.body.force;
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

        if (force) {
            session.data.forceTime = Date.now()
        } else if (session.data.forceTime) {
            if (Date.now() - session.data.forceTime > 1500) {
                delete session.data.forceTime;
            } else {
                response.status(403).send(ErrorMessages.REJECTED);
                return;
            }
        }

        session.data = { ...session.data, ...data };

        const currentClient = session.clients.find(client => client.id === data.clientId);
        if (currentClient) {
            currentClient.current = data.current;
        }
        response.json(session.data)
        return broadcastData(session, session.data, force);
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
        sessionId: createSession(request.body),
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
    startStreamingSession,
    requestJoin
}