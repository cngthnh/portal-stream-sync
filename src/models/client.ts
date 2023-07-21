import { Response } from "express";

export interface Client {
    id: number,
    response : Response
}