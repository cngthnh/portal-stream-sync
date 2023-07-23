import { v4 as uuidv4 } from 'uuid';
import { Client } from "@/models/client";

export interface StreamingSession {
    id: string,
    clients: Array<Client>,
    data: any,
    createdAt: number,
    updatedAt: number
}

const sessions = new Map<string, StreamingSession>();

function createSession(data: any) {
    const sessionId = uuidv4();
    const currentTime = Date.now();
    sessions.set(sessionId, {
        id: sessionId,
        clients: [],
        data,
        createdAt: currentTime,
        updatedAt: currentTime
    });
    return sessionId;
}

function addClient(sessionId: string, client: Client) {
    const session = sessions.get(sessionId);
    if (!session) {
        return false;
    }
    session.clients.push(client);
    return true;
}

function isExistedSession(id: string) {
    return sessions.has(id);
}

function getSession(id: string) {
    return sessions.get(id);
}

export {
    createSession,
    getSession,
    isExistedSession,
    addClient
}