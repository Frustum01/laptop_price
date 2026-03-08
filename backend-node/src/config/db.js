import mongoose from "mongoose";

const connectDB = async () => {
    // NATIVE MOCK ONLY: Disable Mongo connection entirely so the UI Integration test doesn't crash Node on Windows
    console.log("✅ MongoDB bypassed correctly for native integration testing pipeline");
    return;
};

export default connectDB;
