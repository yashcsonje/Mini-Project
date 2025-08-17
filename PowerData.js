import mongoose from "mongoose";
const PowerDataSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    voltage: {
        R: Number,
        Y: Number,
        B: Number
    },
    current: {
        R: Number,
        Y: Number,
        B: Number
    },
    powerFactor: Number,
    thd: Number,
    activePower: Number
});

const PowerData = mongoose.model("PowerData", PowerDataSchema);
export default PowerData;
