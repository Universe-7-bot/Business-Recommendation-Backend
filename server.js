const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const Airtable = require("airtable");
const { OpenAI } = require("openai");
const { Anthropic } = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const dotenv = require("dotenv");
dotenv.config();

app.use(bodyParser.json());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.BASE_ID);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/get-resources", async (req, res) => {
    const formData = req.body;
    // console.log(formData);
    try {
        const filters = [];

        if (formData.sectors && formData.sectors.length > 0) {
            const sectorFilters = formData.sectors.map(sector => `FIND("${sector}", {Sector})`);
            sectorFilters.push(`FIND("All sectors", {Sector})`);
            filters.push(`OR(${sectorFilters.join(', ')})`);
        }

        const filterFormula = filters.length ? `AND(${filters.join(', ')})` : '';
        console.log(filterFormula);

        const records = await base("Technical tools").select({
            filterByFormula: filterFormula
        }).all();

        const resources = records.map(record => ({
            id: record.id,
            fields: record.fields
        }));

        // console.log(resources);

        const prompt = `
        You are an AI assistant helping to recommend accurate resources based on specific sectors chosen by the user.

        The user’s selected sectors are: ${JSON.stringify(formData.sectors)}. Please filter and provide only resources that are highly relevant to these sectors.

        For each resource, structure the response in the following JSON format:
        {
            "resources": [
                {
                    "id": "<Resource ID>",
                    "fields": {
                        "Geography": "<Geography>",
                        "Stage": ["<Stage(s)>"],
                        "Category": ["<Category(s)>"],
                        "Sector": ["<Sector(s)>"],
                        "Score": <Relevance Score (0-1)>,
                        "Link to tool": "<Link>",
                        "Resource": "<Resource Name>",
                        "Description": "<Resource Description>"
                    }
                },
                // More resources as needed...
            ]
        }

        Make sure to:
        1. **Filter** resources strictly based on the provided sectors: ${JSON.stringify(formData.sectors)}.
        2. **Provide a "Score"** field indicating the relevance of the resource to the specified sectors (a value between 0 and 1).
        3. **Use only relevant resources** based on the user's "sectors," and omit any resources unrelated to the sectors provided.

        Respond with only the JSON object in the specified format, without additional text. Ensure that each "Resource" entry includes an accurate, relevant description and link.
        `;

        let aiGeneratedResources;
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const aiResponse = await model.generateContent(prompt);
            const sanitizedText = aiResponse.response.text().replace(/```json|```/g, '').trim();
            aiGeneratedResources = JSON.parse(sanitizedText);
            console.log(aiGeneratedResources);
        } catch (error) {
            console.error("AI response generating error:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to generate AI-generated response as JSON"
            });
        }

        res.json({
            success: true,
            resources: resources,
            aiGeneratedResources: aiGeneratedResources
        });
    } catch (error) {
        console.error("Error fetching resources:", error);
        res.status(500).json({ success: false, error: "Failed to retrieve resources." });
    }
})

app.listen(PORT, (err) => {
    if (err) console.log(err);
    else console.log(`Server is running on http://localhost:${PORT}`);
})