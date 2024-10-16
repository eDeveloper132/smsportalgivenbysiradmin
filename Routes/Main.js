import express from "express";
import path from "path";
import 'dotenv/config';
import axios from "axios";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
router.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../Views/index.html"));
});
router.get("/toapprove", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../Views/approvetag.html"));
});
router.get('/approvedata', async (req, res) => {
    console.log('Received request for approved data');
    var data = JSON.stringify({
        collection: "alphatags",
        database: "test",
        dataSource: "SMSCluster",
        filter: {
            pid: null
        },
        projection: {
            _id: 1,
            pid: 1,
            account_id: 1,
            workspace_id: 1,
            user_id_clicksend: 1,
            user_id: 1,
            alpha_tag: 1,
            status: 1,
            reason: 1
        },
    });
    console.log('Request data prepared:', data);
    var config = {
        method: "post",
        url: "https://ap-southeast-1.aws.data.mongodb-api.com/app/data-mdipydh/endpoint/data/v1/action/find",
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Request-Headers": "*",
            "api-key": `${process.env.MongoDB_API_KEY}`,
        },
        data: data,
    };
    try {
        console.log('Sending request to MongoDB API...');
        const response = await axios(config);
        console.log('Received response from MongoDB API:', response.data);
        res.json(response.data);
    }
    catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data");
    }
});
const username = 'bluebirdintegrated@gmail.com';
const apiKey = 'EA26A5D0-7AAC-6631-478B-FC155CE94C99';
router.post('/getapproved', async (req, res) => {
    console.log('Received request body:', req.body);
    // Access the first item if an array is sent
    const { _id, user_id, pid, alpha_tag, status, reason } = req.body[0];
    console.log('Received data:', _id, user_id, pid, alpha_tag, status, reason);
    // Check if required fields are present
    if (user_id && alpha_tag && status && reason) {
        console.log('All required fields are present. Proceeding to ClickSend API call.');
        try {
            // ClickSend API request
            console.log('Sending request to ClickSend API...');
            const apiResponse = await axios.post('https://rest.clicksend.com/v3/alpha-tags', {
                alpha_tag: alpha_tag,
                reason: reason
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${username}:${apiKey}`).toString('base64')
                }
            });
            console.log('Received response from ClickSend API:', apiResponse.data);
            // Check response status before proceeding
            if (apiResponse.status >= 200 && apiResponse.status < 300) {
                // Prepare data for MongoDB replacement
                const data = {
                    pid: apiResponse.data.id, // Assuming the ID from ClickSend response
                    account_id: apiResponse.data.account_id,
                    workspace_id: apiResponse.data.workspace_id,
                    user_id_clicksend: apiResponse.data.user_id,
                    status: status,
                };
                const REPLACE_URL = "https://ap-southeast-1.aws.data.mongodb-api.com/app/data-mdipydh/endpoint/data/v1/action/replaceOne";
                try {
                    // Log request payload for MongoDB
                    console.log("Request Payload for MongoDB Replace:", {
                        dataSource: "SMSCluster",
                        database: "test",
                        collection: "alphatags",
                        filter: { user_id: user_id },
                        replacement: data,
                    });
                    // Replace the document in MongoDB
                    const replaceResponse = await axios.post(REPLACE_URL, {
                        dataSource: "SMSCluster",
                        database: "test",
                        collection: "alphatags",
                        filter: { user_id: user_id },
                        replacement: data,
                    }, {
                        headers: {
                            "Content-Type": "application/json",
                            "api-key": process.env.MongoDB_API_KEY,
                        },
                    });
                    console.log("Replace Response from MongoDB:", replaceResponse.data);
                    // Final response to the client
                    console.log('Data sent successfully to ClickSend. Sending response back to client.');
                    return res.status(200).json({
                        message: 'Data sent successfully to ClickSend',
                        responseData: apiResponse.data
                    });
                }
                catch (error) {
                    console.error("Error replacing document in MongoDB:", error);
                    return res.status(500).json({ message: 'Error replacing document in MongoDB', error });
                }
            }
            else {
                console.error('Unexpected response from ClickSend API:', apiResponse.data);
                return res.status(apiResponse.status).json({ message: 'Unexpected response from ClickSend API', error: apiResponse.data });
            }
        }
        catch (error) {
            if (error.response) {
                console.error('Error from ClickSend API:', error.response.data);
                return res.status(error.response.status).json({ message: 'Failed to send data to ClickSend', error: error.response.data });
            }
            else {
                console.error('Error while communicating with ClickSend API:', error.message);
                return res.status(500).json({ message: 'Internal Server Error', error: error.message });
            }
        }
    }
    else {
        console.warn('Missing required fields:', { user_id, alpha_tag, status, reason });
        return res.status(400).json({ message: 'Missing required fields' });
    }
});
export default router;
