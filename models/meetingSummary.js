const mongoose = require('mongoose');

const meetingSummarySchema = new mongoose.Schema({

    roomId: {
        type: String,
        required: true
    },

    summary: {
        type: [String],
        default: []
    },

    actionItems: {
        type: [String],
        default: []
    }

}, {
    timestamps: true
});

module.exports = mongoose.model(
    'MeetingSummary',
    meetingSummarySchema
);