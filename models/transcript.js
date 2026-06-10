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
    },

    summary: {
        type: String,
        default: ''
    },

    actionItems: {
        type: [String],
        default: []
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('Transcript', transcriptSchema);