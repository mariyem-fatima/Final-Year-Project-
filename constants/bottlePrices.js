// Bottle Price Constants
// Default pricing for different bottle sizes

const BOTTLE_PRICES = {
    '0.5L': 30,    // 0.5 Liter bottle = 30 PKR
    '1L': 50,      // 1 Liter bottle = 50 PKR
    '5L': 80,      // 5 Liter bottle = 80 PKR
    '20L': 100     // 20 Liter bottle = 100 PKR
};

// Helper function to get price for a bottle type
const getBottlePrice = (bottleType) => {
    return BOTTLE_PRICES[bottleType] || 0;
};

// Helper function to get all bottle types with prices
const getAllBottlePrices = () => {
    return Object.entries(BOTTLE_PRICES).map(([type, price]) => ({
        type,
        price,
        display: `${type} - Rs. ${price}`
    }));
};

// Validate if bottle type exists
const isValidBottleType = (bottleType) => {
    return Object.hasOwnProperty.call(BOTTLE_PRICES, bottleType);
};

module.exports = {
    BOTTLE_PRICES,
    getBottlePrice,
    getAllBottlePrices,
    isValidBottleType
};