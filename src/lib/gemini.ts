import { GoogleGenAI, Type } from "@google/genai";
import { TrainEvent, StationEvent, AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeKavachData(
  trainData: TrainEvent[],
  stationData: StationEvent[]
): Promise<AnalysisResult> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      summary: "AI Analysis unavailable: API Key missing.",
      trainFaults: [],
      stationFaults: [],
      recommendations: ["Please configure GEMINI_API_KEY in secrets."]
    };
  }

    const prompt = `
    Analyze the following Kavach (TCAS) system data. 
    TRNMSNMA (Train Data): ${JSON.stringify(trainData.slice(0, 20))}
    RFCOMM (Station Data): ${JSON.stringify(stationData.slice(0, 20))}

    Task:
    1. Identify if problems are in Station TCAS or Train TCAS.
    2. Determine if faults are Hardware (e.g., signal loss, sensor failure) or Software (e.g., version mismatch, logic errors, ack delays).
    3. Analyze specific events: Downgrades, Overrides (ack time), SOS, Emergency Brakes (EB), and Train Length variations.
    4. Provide a summary and specific recommendations for the Medha Kavach team.

    Note: In the data, 'locoId' refers to 'Train No' and 'stationId' refers to 'Station Name'.

    Return the result in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            trainFaults: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  locoId: { type: Type.STRING, description: "The Train No (Loco ID) associated with the fault." },
                  issue: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["Hardware", "Software"] }
                }
              }
            },
            stationFaults: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stationId: { type: Type.STRING, description: "The Station Name (Station ID) associated with the fault." },
                  issue: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["Hardware", "Software"] }
                }
              }
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "trainFaults", "stationFaults", "recommendations"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return {
      summary: "Error during AI analysis.",
      trainFaults: [],
      stationFaults: [],
      recommendations: ["Try again later or check data format."]
    };
  }
}
