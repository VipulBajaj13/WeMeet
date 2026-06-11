const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true
    },

    user: {
        type: String,
        required: true
    },

    transcript: {
        type: String,
        required: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('Transcript', transcriptSchema);