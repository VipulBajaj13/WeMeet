require('dotenv').config();

const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function test() {
    try {

        const response = await groq.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: 'Say hello'
                }
            ],
            model: 'llama-3.3-70b-versatile'
        });

        console.log(response.choices[0].message.content);

    } catch (err) {
        console.error(err);
    }
}

test();