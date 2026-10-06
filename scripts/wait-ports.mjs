/**
 * Attend que les ports soient disponibles.
 * Usage: node scripts/wait-ports.mjs 3000 3002 3003
 */
import net from "node:net";

const ports = process.argv.slice(2).map(Number);
if (ports.length === 0) {
  console.error("Usage: wait-ports.mjs <port>...");
  process.exit(1);
}

const start = Date.now();
const timeout = 120000; // 2 min max

async function waitPort(port) {
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for port ${port}`));
        return;
      }
      const socket = net.createConnection(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
}

await Promise.all(ports.map(waitPort));
console.log(`Ports ${ports.join(", ")} ready`);