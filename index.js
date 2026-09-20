const dotenv =require("dotenv")
dotenv.config()
const express = require('express')
const axios = require('axios')
const mongoose = require("mongoose")
const path = require("path");
const {Server} = require("socket.io")
const http = require("http")
const cors = require("cors")
const { google } = require("googleapis");
const tutorPayments = require(
  "./routers/tutorPayments"
);
const port = process.env.PORT || 8800; 
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const getPostDataOnMongo = require("./routers/getPostDataOnMongo")
const metawebhook = require("./routers/metawebhook")
const task = require("./routers/task") 
const tutor =require("./routers/tutor") 
const GoogleSheet = require("./routers/googleSheet")
const authForLogin = require('./routers/auth')
const comment = require("./routers/comment")
const query = require("./routers/queryHandling")
const websiteRouter = require('./routers/website');

const app = express() 
app.use(express.json())

app.use(express.urlencoded({ extended: true }));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);


const server = http.createServer(app)
const io = new Server(server, {
  cors: {
  origin: allowedOrigins.length ? allowedOrigins : '*',
      methods: ['GET', 'POST','OPTIONS','PATCH', 'PUT'],       // Allow GET and POST requests
      credentials: true,              // If you're using cookies or headers
  },
});

// Use CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin is not allowed by CORS"));
  },
  methods: ['GET', 'POST', 'OPTIONS','PATCH', 'PUT','DELETE'],
  credentials: true,
}));


 

const connectToDatabase = async () => {
  const mongoUrl = process.env.MONGO_CONNECTING_URL?.trim();

  if (!mongoUrl || mongoUrl.includes("<") || mongoUrl.includes(">")) {
    throw new Error(
      "MONGO_CONNECTING_URL is missing or still contains a placeholder. Update dashbord_backend/.env with a real MongoDB connection string."
    );
  }

  try {
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    throw error;
  }
};

app.use("/api/metawebhook",metawebhook(io))
app.use("/api/getPostDataOnMongo",getPostDataOnMongo)
app.use("/api/task",task)
app.use("/api/tutor",tutor) 
app.use("/api/googlesheet",GoogleSheet)
app.use("/api/auth",authForLogin)
app.use("/api/comment",comment)
app.use("/api/query",query)
app.use('/api/website', websiteRouter);
app.use(
  "/api/tutor-payments",
  tutorPayments
);

app.post("/register-phone", async (req, res) => {
  try {
      const { cc, phone_number, method, cert, pin ,verified_name} = req.body;

      const payload = {
          cc,
          phone_number,
          method,
          cert,
          verified_name
      };

      // Add PIN if two-step verification is enabled
      if (pin) {
          payload.pin = pin;
      }

      const response = await axios.post(
          'https://graph.facebook.com/v22.0/552556674607716/phone_numbers',
          payload,
          {
              headers: {
                  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                  "Content-Type": "application/json",
              },
          }
      );

      res.json({ success: true, data: response.data });
  } catch (error) {
      console.error("Error registering phone number:", error.response?.data || error.message);
      res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});



// Load credentials from JSON file
const auth = new google.auth.GoogleAuth({
  keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
  scopes: ["https://www.googleapis.com/auth/drive"],
});


async function Make_Folder(folderName) {
  const drive = google.drive({ version: "v3", auth });

  // Parent folder ID (replace with your actual folder ID)
  const parentFolderId =process.env.GOOGLE_DRIVE_FOLDER_ID;

  // 🔍 Step 1: Search for an existing folder
  const searchResponse = await drive.files.list({
    q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, webViewLink)",
  });

  if (searchResponse.data.files.length > 0) {
    // ✅ Folder already exists, return its link
    return searchResponse.data.files[0].webViewLink;
  }

  // 📁 Step 2: Create new folder if it doesn't exist
  const folderMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentFolderId],
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: "id, webViewLink",
  });

  const folderId = folder.data.id;

  // 📂 Step 3: Create subfolders
  const subFolders = ["Question Files", "Solution Files","manual_sample"];
  for (let subFolderName of subFolders) {
    await drive.files.create({
      resource: {
        name: subFolderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [folderId],
      },
      fields: "id",
    });
  }

  // Return the new folder link
  return folder.data.webViewLink;
}
// Express route
app.post("/create-folder", async (req, res) => {
  try {
    const { folderName } = req.body;
    const result = await Make_Folder(folderName);

    res.json({ folderLink: result });
  } catch (error) {
    console.error("Error creating folder:", error);
    res.status(500).send("Failed to create folder");
  }
});


// Function to share folder access
async function shareFolder(folderId, email, role = "writer") {
  const drive = google.drive({ version: "v3", auth });

  try {
    const permission = await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role: role, // "reader" (view only) or "writer" (edit)
        type: "user",
        emailAddress: email,
      },
      fields: "id",
    });

    return { success: true, message: `Access granted to ${email}` };
  } catch (error) {
    console.error("Error sharing folder:", error);
    return { success: false, message: error.message };
  }
}

// Express API route to share folder access
app.post("/share-folder", async (req, res) => {
  try {
    const { folderId, email, role } = req.body;

    if (!folderId || !email) {
      return res.status(400).json({ success: false, message: "Folder ID and email are required" });
    }

    const result = await shareFolder(folderId, email, role || "writer");
    res.json(result);
  } catch (error) {
    console.error("Error in /share-folder API:", error);
    res.status(500).send("Failed to share folder");
  }
});
// app.post('/webhook', async (req, res) => {
//   const { entry } = req.body

//   if (!entry || entry.length === 0) {
//     return res.status(400).send('Invalid Request')
//   }

//   const changes = entry[0].changes

//   if (!changes || changes.length === 0) {
//     return res.status(400).send('Invalid Request')
//   }

//   const statuses = changes[0].value.statuses ? changes[0].value.statuses[0] : null
//   const messages = changes[0].value.messages ? changes[0].value.messages[0] : null

//   if (statuses) {
//     // Handle message status
//     console.log(`
//       MESSAGE STATUS UPDATE:
//       ID: ${statuses.id},
//       STATUS: ${statuses.status}
//     `)
//   }

// Send WhatsApp template message
async function sendTemplateMessage(to, templateName, languageCode, components = []) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "template", 
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error sending template message:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}
// "components": [
//   {
//     "type": "body",
//     "parameters": [
//       { "type": "text", "text": "John Doe" },
//       { "type": "text", "text": "Order #12345" }
//     ]
//   }
// ]
// API endpoint to send a template message
app.post("/send-template", async (req, res) => {
  const { phone, templateName, languageCode, components } = req.body;
  console.log({phone, templateName, languageCode, components})
  if (!phone || !templateName || !languageCode) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const result = await sendTemplateMessage(phone, templateName, languageCode, components);
  res.json(result);
});

//   if (messages) {
//     // Handle received messages
//     if (messages.type === 'text') {
//       if (messages.text.body.toLowerCase() === 'hello') {
//         replyMessage(messages.from, 'Hello. How are you?', messages.id)
//       }

//       if (messages.text.body.toLowerCase() === 'list') {
//         sendList(messages.from)
//       }

//       if (messages.text.body.toLowerCase() === 'buttons') {
//         sendReplyButtons(messages.from)
//       }
//     }

//     if (messages.type === 'interactive') {
//       if (messages.interactive.type === 'list_reply') {
//         sendMessage(messages.from, `You selected the option with ID ${messages.interactive.list_reply.id} - Title ${messages.interactive.list_reply.title}`)
//       }

//       if (messages.interactive.type === 'button_reply') {
//         sendMessage(messages.from, `You selected the button with ID ${messages.interactive.button_reply.id} - Title ${messages.interactive.button_reply.title}`)
//       }
//     }
    
//     console.log(JSON.stringify(messages, null, 2))
//   }
  
//   res.status(200).send('Webhook processed')
// })

async function sendMessage(to, body) {
  await axios({
    url: 'https://graph.facebook.com/v21.0/phone_number_id/messages',
    method: 'post',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body
      }
    })
  })
}

async function replyMessage(to, body, messageId) {
  await axios({
    url: 'https://graph.facebook.com/v21.0/phone_number_id/messages',
    method: 'post',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body
      },
      context: {
        message_id: messageId
      }
    })
  })
}

async function sendList(to) {
  await axios({
    url: 'https://graph.facebook.com/v21.0/phone_number_id/messages',
    method: 'post',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: 'Message Header'
        },
        body: {
          text: 'This is a interactive list message'
        },
        footer: {
          text: 'This is the message footer'
        },
        action: {
          button: 'Tap for the options',
          sections: [
            {
              title: 'First Section',
              rows: [
                {
                  id: 'first_option',
                  title: 'First option',
                  description: 'This is the description of the first option'
                },
                {
                  id: 'second_option',
                  title: 'Second option',
                  description: 'This is the description of the second option'
                }
              ]
            },
            {
              title: 'Second Section',
              rows: [
                {
                  id: 'third_option',
                  title: 'Third option'
                }
              ]
            }
          ]
        }
      }
    })
  })
}

async function sendReplyButtons(to) {
  await axios({
    url: 'https://graph.facebook.com/v21.0/phone_number_id/messages',
    method: 'post',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: 'Message Header'
        },
        body: {
          text: 'This is a interactive reply buttons message'
        },
        footer: {
          text: 'This is the message footer'
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'first_button',
                title: 'First Button'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'second_button',
                title: 'Second Button'
              }
            }
          ]
        }
      }
    })
  })
}
 
// Simple route to respond to API calls
app.get("/", (req, res) => {
  res.send("Server is running...");
});

  
// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('Frontend connected');

  socket.on('disconnect', () => {
      console.log('Frontend disconnected');
  });
});
const startServer = async () => {
  server.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });

  // Do not block the dev server while a remote MongoDB cluster is connecting.
  // Requests that need MongoDB will work as soon as the connection is ready.
  connectToDatabase().catch(() => {
    console.error(
      'MongoDB is unavailable. The server is running, but database routes are not ready.'
    );
  });
};

startServer();