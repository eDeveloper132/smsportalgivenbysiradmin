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
router.post('/checkuser', async (req, res) => {
    const { userId } = req.body;
    // Prepare the query to find a document by its ObjectId
    const data = JSON.stringify({
        collection: "signs",
        database: "test",
        dataSource: "SMSCluster",
        filter: {
            _id: { $oid: userId } // Use $oid to query by ObjectId
        },
        projection: {
            _id: 1,
            id: 1,
            Name: 1,
            Email: 1,
            Password: 1,
            PhoneNumber: 1,
            Role: 1,
            Organization: 1,
            isVerified: 1,
        },
    });
    console.log('Request data prepared:', data);
    const config = {
        method: "post",
        url: "https://ap-southeast-1.aws.data.mongodb-api.com/app/data-mdipydh/endpoint/data/v1/action/findOne", // Use findOne if expecting a single result
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
        if (response.data && response.data.document) {
            res.json(response.data.document);
        }
        else {
            res.status(404).send("User not found");
        }
    }
    catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data");
    }
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
router.post('/getapproved', async (req, res) => {
    console.log('Received request body:', req.body);
    const { _id, user_id, alpha_tag, status, reason } = req.body[0];
    if (!user_id || !alpha_tag || !status || !reason) {
        console.warn('Missing required fields:', { user_id, alpha_tag, status, reason });
        return res.status(400).json({ message: 'Missing required fields' });
    }
    const data = JSON.stringify({
        collection: "subaccounts",
        database: "test",
        dataSource: "SMSCluster",
        filter: { userId: { $oid: user_id } }, // Adjusted query for ObjectId
        projection: { username: 1, api_key: 1 },
    });
    console.log('Request data prepared:', data);
    const config = {
        method: "post",
        url: "https://ap-southeast-1.aws.data.mongodb-api.com/app/data-mdipydh/endpoint/data/v1/action/findOne",
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Request-Headers": "*",
            "api-key": `${process.env.MongoDB_API_KEY}`,
        },
        data,
    };
    try {
        console.log('Sending request to MongoDB API...');
        const response = await axios(config);
        console.log('Received response from MongoDB API:', response.data);
        if (!response.data || !response.data.document) {
            return res.status(404).json({ message: "User not found in MongoDB" });
        }
        const { username, api_key: apiKey } = response.data.document;
        console.log('Sending request to ClickSend API...');
        const apiResponse = await axios.post('https://rest.clicksend.com/v3/alpha-tags', { alpha_tag, reason }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${username}:${apiKey}`).toString('base64'),
            },
        });
        console.log('Received response from ClickSend API:', apiResponse.data);
        if (apiResponse.status >= 200 && apiResponse.status < 300) {
            const updateData = {
                pid: apiResponse.data.id,
                account_id: apiResponse.data.account_id,
                workspace_id: apiResponse.data.workspace_id,
                user_id_clicksend: apiResponse.data.user_id,
                status,
            };
            console.log('Preparing to update document in MongoDB:', updateData);
            const updateResponse = await axios.post("https://ap-southeast-1.aws.data.mongodb-api.com/app/data-mdipydh/endpoint/data/v1/action/updateOne", {
                dataSource: "SMSCluster",
                database: "test",
                collection: "alphatags",
                filter: { _id: { $oid: _id } },
                update: { $set: updateData }, // Only updating specific fields
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.MongoDB_API_KEY,
                },
            });
            console.log("Update Response from MongoDB:", updateResponse.data);
            return res.status(200).json({
                message: 'Data sent successfully to ClickSend',
                responseData: apiResponse.data,
            });
        }
        else {
            console.error('Unexpected response from ClickSend API:', apiResponse.data);
            return res.status(apiResponse.status).json({
                message: 'Unexpected response from ClickSend API',
                error: apiResponse.data,
            });
        }
    }
    catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.data);
            return res.status(error.response.status).json({
                message: 'Failed to process the request',
                error: error.response.data,
            });
        }
        else {
            console.error('Internal Error:', error.message);
            return res.status(500).json({ message: 'Internal Server Error', error: error.message });
        }
    }
});
export default router;
