const BaseService = require('core/BaseService');
const MemoryConfig = require('config/MemoryConfig');

class MarketService extends BaseService {
    analyze() {
        if (Game.time % 10 !== 0) return;
        const config = Memory.empire.market || {};
        if (!config.enabled) return;

        for (const roomName in Game.rooms) {
            if (!MemoryConfig.flag(roomName, 'market', true)) continue;
            const room = Game.rooms[roomName];
            const terminal = room.terminal;
            if (!terminal || terminal.cooldown > 0) continue;

            const reserve = config.energyReserve || 100000;
            if (terminal.store[RESOURCE_ENERGY] > reserve) {
                this.sellResource(roomName, terminal, RESOURCE_ENERGY, config.sellBatchSize || 50000, config.minCreditsPerEnergy || 0);
            }
        }
    }

    sellResource(roomName, terminal, resourceType, amount, minPrice) {
        const orders = Game.market.getAllOrders({ type: ORDER_BUY, resourceType })
            .filter((order) => order.price >= minPrice && order.remainingAmount > 0)
            .sort((a, b) => b.price - a.price);
        if (orders.length === 0) return;

        const order = orders[0];
        const dealAmount = Math.min(amount, order.remainingAmount, terminal.store[resourceType]);
        const cost = Game.market.calcTransactionCost(dealAmount, roomName, order.roomName);
        if (resourceType === RESOURCE_ENERGY && terminal.store[RESOURCE_ENERGY] < dealAmount + cost) return;
        if (resourceType !== RESOURCE_ENERGY && terminal.store[RESOURCE_ENERGY] < cost) return;

        const result = Game.market.deal(order.id, dealAmount, roomName);
        if (result === OK) console.log(`[Market] sold ${dealAmount} ${resourceType} at ${order.price}`);
    }
}

module.exports = MarketService;
