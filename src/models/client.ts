import { Response } from "express";

export interface Client {
    id: number,
    current: number,
    response : Response
}