const WebSocket = require('ws');

class WsClientService {
    constructor() {
        // clientId -> { ws, type, typeMain, typeSub }
        this.clients = new Map();
        this.nextClientId = 1;
    }

    registerClient(ws) {
        const clientId = this.nextClientId++;
        this.clients.set(clientId, { ws, type: null });

        ws.on('close', () => {
            this.clients.delete(clientId);
        });

        return clientId;
    }

    setClientType(clientId, type) {
        const client = this.clients.get(clientId);
        if (!client) return false;
        client.type = type;
        try {
            const parts = String(type || '').split('-');
            client.typeMain = parts[0] || type;
            client.typeSub = parts.length > 1 ? parts.slice(1).join('-') : null;
        } catch (e) {
            client.typeMain = type;
            client.typeSub = null;
        }
        return true;
    }

    getClientType(clientId) {
        const client = this.clients.get(clientId);
        return client ? client.type : null;
    }

    getClientWs(clientId) {
        const client = this.clients.get(clientId);
        return client ? client.ws : null;
    }

    // 返回匹配类型的客户端数组: [{ clientId, ws }]
    getClientsByType(type) {
        const out = [];
        for (const [id, client] of this.clients.entries()) {
            if (!client) continue;
            if (client.type === type || client.typeMain === type) out.push({ clientId: id, ws: client.ws });
        }
        return out;
    }

    //Send message to target client
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return false;
        const ws = client.ws;
        try {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: client.type, data: message }));
                return true;
            }
        } catch (e) {
            // ignore
        }
        return false;
    }

    // Send message to all clients of a type
    sendToType(type, message) {
        for (const [id, client] of this.clients.entries()) {
            if (!client) continue;
            if (client.type === type || client.typeMain === type) {
                const ws = client.ws;
                try {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: client.typeMain || type, data: message }));
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    // 广播消息给所有客户端（安全发送）
    broadcast(message, type) {
        for (const [id, client] of this.clients.entries()) {
            const ws = client && client.ws;
            try {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: type, data: message }));
                }
            } catch (e) {
                // ignore
            }
        }
    }
}

module.exports = new WsClientService();
