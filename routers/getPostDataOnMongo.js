const express = require('express');
const Task = require("../models/task");
const router = express.Router();
const mongoose = require("mongoose")
const Contact = require('../models/contact'); // Contact schema
const Message = require('../models/message'); // Message schema
const axios = require('axios');
const contact = require('../models/contact');
const message = require('../models/message');
// const fs = require("fs"); 
const multer = require("multer"); 
const FormData = require("form-data");
const Tutor = require("../models/tutor")
const authMiddleware = require('../middleware/authMiddleware')
const {encryptFunction, decryptFunction} = require('../phoneSecurity')
// const upload = multer({ storage }); 
//  const upload =require("./multer")
// Initialize Multer with memory storage
const storage = multer.memoryStorage(); // Store file in memory, not disk
const upload = multer({ storage });
//write in googel sheet=====================================================
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
 keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
 scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
function getIndianTime() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID_FOR_PERDAY_CHAT = "1uMe5wh96NIPa7Vtgl7_z4Z69c6zD1izlae0CEGWTItM";
async function writeContactToSheet(contact) {
  try {
    const sheets = google.sheets({ version: "v4", auth });

    // Prepare values to write
    const values = [[getIndianTime(), contact.phone_number, contact.chatId, contact.level]];

    // Append the new data to the sheet (auto-finds next empty row)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_FOR_PERDAY_CHAT,
      range: "Sheet1!A:D", // Adjust if necessary
      valueInputOption: "RAW",
      requestBody: { values: values },
    });

    console.log(`✅ Contact successfully written to Google Sheets`);
  } catch (error) {
    console.error("❌ Error writing to Google Sheets:", error);
  }
}

// writeContactToSheet({phone_number:"f", chatId:"F", level:"FF"})
//====================================================================
router.get("/", authMiddleware, async (req, res) => {
  try {
      const data = req.user;
      
      res.json({ status: true, data, msg: "Token is working..." });
  } catch (error) {
      console.error("Error in token verification route:", error);
      res.status(500).json({ status: false,data:{}, message: "Internal server error" });
  }
});


//to send message from frontend to Mongodb and then send message to clint
const MAX_RETRIES = 3;

router.post("/sendmessage",authMiddleware, async (req, res) => {
  let retries = 0; 
  console.log("clicked")
  while (retries < MAX_RETRIES) { 
    console.log("click2")
    const session = await mongoose.startSession();
    session.startTransaction();  
    try {
      const { message, direction ,components } = req.body;
      let {phone_number} = req.body
      console.log( {phone_number, message, direction ,components }) 
      if (typeof phone_number !== "string" || !phone_number.trim() || !message || !direction) {
        return res.status(400).json({ error: 'Missing required fields.' });
      } 
      phone_number = decryptFunction(phone_number)
      if (!/^\+\d{1,15}$/.test(phone_number)) {
        return res.status(400).json({ error: 'Invalid phone number.' });
      }
      // Find the contact by phone number
      
      let contact = await Contact.findOne({ phone_number }).session(session);
      console.log("phon")

      // If contact does not exist, create a new contact
      if (!contact) {
         let tutor = await Tutor.findOne({phoneNumber:phone_number}).session(session)
              // If contact doesn't exist, create a new one
              let lastContact = await Contact.findOne().sort({ chatId: -1 }).session(session);
              let newChatId = lastContact ? `CI${(parseInt(lastContact.chatId.slice(2)) + 1).toString().padStart(4, '0')}` : 'CI0001';

        contact = new Contact({
          chatId:newChatId,
          tutorID:tutor?tutor.tutorID:"TI0000",
           name:tutor?tutor.name:"Unknown",
            phone_number });
          await contact.save({ session });
         
      }  
       // Get today's date in YYYY-MM-DD format============================================================
    const today = new Date().toISOString().split("T")[0];
    const lastMsgDate = contact.lastMsgTime ? new Date(contact.lastMsgTime).toISOString().split("T")[0] : null;

    // If lastMsgTime is not today, write to the sheet 
    if (lastMsgDate !== today) { 
      await writeContactToSheet({
        phone_number: contact.phone_number,
        chatId: contact.chatId,
        level: contact.level
      }); 
    }

     // Validate `message.text.body` before using it
     if (!message?.text?.body) {
      throw new Error("Invalid message format: message.text.body is missing");
    }
      //===========================================================
      // Send the message 
      let result;
      if (message.text.body.startsWith("/")) {
        const templateName = message.text.body.replace("/", "").split(" ")[0];
        result = await sendTemplateMessage(phone_number, templateName, "en_US", components);
      } else {
        result = await sendMessage(phone_number, message,contact.chatId);
      } 
      console.log({ resultttttttttttttttt: JSON.stringify(result, null, 2) });
 
      if (!result || result.success === false || !result.messages?.[0]?.id) {
        const providerError = result?.error?.error?.message || result?.error?.message || result?.error;
        throw new Error(providerError || "Message could not be sent");
      }

      // Save the message
      const newMessage = new Message({
        contact_id: contact._id,
        message_id: result.messages[0].id,
        message,
        messageSenderName:req.user.userName,
        direction,
        timestamp: new Date(),
      });
      const savedMessage=await newMessage.save({ session });
      
      // Update the contact with the latest message
      contact.last_message_id = newMessage._id;
      contact.lastMsgTime = newMessage.timestamp
      if (direction === 'received') {
        contact.unread_count += 1;
      }
      await contact.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: 'Message and contact updated successfully.',
        contact,
        savedMessage: savedMessage,
      });
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
        console.warn(`TransientTransactionError occurred. Retrying... (${retries + 1}/${MAX_RETRIES})`);
        retries += 1;
        await new Promise(resolve => setTimeout(resolve, 200)); 
      } else {
        const providerError = error.response?.data || error.message;
        console.error('Error occurred while sending message:', providerError);
        return res.status(500).json({
          error: 'An error occurred while saving the message.',
          details: typeof providerError === 'string' ? providerError : providerError?.error?.message || 'Request failed.',
        });
      }
    }
  }

  // If we exceed retries, return an error
  return res.status(500).json({ error: 'Transaction failed after multiple retries.' });
}); 
 
router.post("/sendfirstmessage",authMiddleware, async (req, res) => {
  let retries = 0; 
  console.log("clicked")
  while (retries < MAX_RETRIES) { 
    console.log("click2")
    const session = await mongoose.startSession();
    session.startTransaction();  
    try {
      const { message, direction ,components , name } = req.body;
      let {phone_number} = req.body
      console.log( {phone_number, message, direction ,components }) 
      if (!phone_number || !message || !direction) {
        return res.status(400).json({ error: 'Missing required fields.' });
      } 
      phone_number = decryptFunction(phone_number)
      // Find the contact by phone number
      
      let contact = await Contact.findOne({ phone_number }).session(session);
      console.log("phon")

      // If contact does not exist, create a new contact
      if (!contact) {
         let tutor = await Tutor.findOne({phoneNumber:phone_number}).session(session)
              // If contact doesn't exist, create a new one
              let lastContact = await Contact.findOne().sort({ chatId: -1 }).session(session);
              let newChatId = lastContact ? `CI${(parseInt(lastContact.chatId.slice(2)) + 1).toString().padStart(4, '0')}` : 'CI0001';

        contact = new Contact({
          chatId:newChatId,
          tutorID:tutor?tutor.tutorID:"TI0000",
           name:tutor?tutor.name:name? name:"Unknown",
            phone_number });
          await contact.save({ session });
         
      }  
       // Get today's date in YYYY-MM-DD format============================================================
    const today = new Date().toISOString().split("T")[0];
    const lastMsgDate = contact.lastMsgTime ? new Date(contact.lastMsgTime).toISOString().split("T")[0] : null;

    // If lastMsgTime is not today, write to the sheet 
    if (lastMsgDate !== today) { 
      await writeContactToSheet({
        phone_number: contact.phone_number,
        chatId: contact.chatId,
        level: contact.level
      }); 
    }

     // Validate `message.text.body` before using it
     if (!message?.text?.body) {
      throw new Error("Invalid message format: message.text.body is missing");
    }
      //===========================================================
      // Send the message 
      if (message.text.body.startsWith("/")) {
        const templateName = message.text.body.replace("/", "").split(" ")[0];
        result = await sendTemplateMessage(phone_number, templateName, "en_US", components);
      } else {
        result = await sendMessage(phone_number, message,contact.chatId);
      } 
      console.log({ resultttttttttttttttt: JSON.stringify(result, null, 2) });
 
      if (!result || !result.messages || !result.messages[0]?.id) {
        throw new Error("Message could not be sent");
      }

      // Save the message
      const newMessage = new Message({
        contact_id: contact._id,
        message_id: result.messages[0].id,
        message,
        messageSenderName:req.user.userName,
        direction,
        timestamp: new Date(),
      });
      const savedMessage=await newMessage.save({ session });
      
      // Update the contact with the latest message
      contact.last_message_id = newMessage._id;
      contact.lastMsgTime = newMessage.timestamp
      if (direction === 'received') {
        contact.unread_count += 1;
      }
      await contact.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: 'Message and contact updated successfully.',
        contact,
        savedMessage: savedMessage,
      });
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
        console.warn(`TransientTransactionError occurred. Retrying... (${retries + 1}/${MAX_RETRIES})`);
        retries += 1;
        await new Promise(resolve => setTimeout(resolve, 200)); 
      } else {
        console.error('Error occurred:', error);
        return res.status(500).json({ error: 'An error occurred while saving the message.' });
      }
    }
  }

  // If we exceed retries, return an error
  return res.status(500).json({ error: 'Transaction failed after multiple retries.' });
}); 

//to send media to the client 
router.post("/send-media",authMiddleware, upload.single("file"), async (req, res) => {
  const { mediaType, caption,filename } = req.body;
  let {recipient} = req.body
  recipient = decryptFunction(recipient)
  console.log({ recipient, mediaType, caption,filename }) 
  const file = req.file;  
  if (!recipient || !mediaType || !file) {
    return res.status(400).json({ error: "All fields are required." });
  }
  const session = await mongoose.startSession();
  session.startTransaction(); 
  try {
    // Step 1: Upload media to WhatsApp
     // Read the uploaded file
     const mimeType = file.mimetype;
   // Step 1: Create FormData
   const formData = new FormData();
   formData.append("messaging_product", "whatsapp");
   formData.append("file", file.buffer, { filename: filename }); // Use the buffer directly
  //  formData.append("file", fs.createReadStream(file.path));
  //  console.log({fff: {...formData.getHeaders()}})
  //  console.log({mimeType})
    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": `multipart/form-data; type=${mimeType}`
        },
      }
    );

    const mediaId = uploadResponse?.data.id; 
 
      // Find the contact by phone number
      let contact = await Contact.findOne({ phone_number:recipient }).session(session);
    console.log({contact})
     // If contact does not exist, create a new contact
     if (!contact) {
      contact = new Contact({ name: 'Unknown', phone_number:recipient });
      const contactSaved= await contact.save({ session }); 
    } 
     // Get today's date in YYYY-MM-DD format============================================================
     const today = new Date().toISOString().split("T")[0];
     const lastMsgDate = contact.lastMsgTime ? new Date(contact.lastMsgTime).toISOString().split("T")[0] : null;
 
     // If lastMsgTime is not today, write to the sheet
     if (lastMsgDate !== today) {
       await writeContactToSheet({
         phone_number: contact.phone_number,
         chatId: contact.chatId,
         level: contact.level
       });
     }
       //===========================================================
    // Step 2: Send media message
    const messageData =mediaType === "document"? {
      messaging_product: "whatsapp",
      to: recipient,
      type: mediaType,
      [mediaType]: {  
        filename:filename,
        id: mediaId,
        caption: mediaType === "image" || mediaType === "video" ? caption : undefined,
      },
    }:
    {
      messaging_product: "whatsapp",
      to: recipient,
      type: mediaType,
      [mediaType]: { 
        id: mediaId,
        caption: mediaType === "image" || mediaType === "video" ? caption : undefined,
      },
    }
    ;
    // console.log({messageData})
   const result= await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      messageData,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    ); 
    console.log({resultsss:JSON.stringify(result.data,null,2)})
// Remove 'messaging_product' and 'to' properties
delete messageData?.messaging_product;
delete messageData?.to; 
        console.log({ff:result.data?.messages[0]?.id})
    if (!result) { 
      throw new Error("Message could not be sent");
    }
     // Save the message
     const newMessage = new Message({
      contact_id: contact?._id,
      message_id: result.data?.messages[0]?.id,
      message:messageData,
      messageSenderName:req.user.userName,
      direction:"sent",
      timestamp: new Date(),
    }); 
    await newMessage.save({ session }); 
     // Update the contact with the latest message
     contact.last_message_id = newMessage._id;
     contact.lastMsgTime = newMessage.timestamp
     await contact.save({ session });  
       // Commit the transaction 
       await session.commitTransaction();
       session.endSession(); 
    return res.status(201).json({
      message: 'Message and contact updated successfully.',
      contact,
      savedMessage: newMessage, 
    }); 
  } catch (error) {
    if (session?.inTransaction()) {
      await session?.abortTransaction();
    }
    session?.endSession();
    console.error("Error sending media:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send media." });
  }
});




//to forward msg and media both 
router.post("/forwardmessage",authMiddleware, async (req, res) => {
  let retries = 0; 
  while (retries < MAX_RETRIES) { 

    const session = await mongoose.startSession();
    session.startTransaction(); 

    try {
      const {  message, direction } = req.body;
      let {phone_number} = req.body
      phone_number= decryptFunction(phone_number)

      if (!phone_number || !message || !direction) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      // Find the contact by phone number
      let contact = await Contact.findOne({ phone_number }).session(session);
 

      // If contact does not exist, create a new contact
      if (!contact) {
        contact = new Contact({ name: 'Unknown', phone_number });
        const contactSaved= await contact.save({ session });
         
      } 
  // Get today's date in YYYY-MM-DD format============================================================
  const today = new Date().toISOString().split("T")[0];
  const lastMsgDate = contact.lastMsgTime ? new Date(contact.lastMsgTime).toISOString().split("T")[0] : null;

  // If lastMsgTime is not today, write to the sheet
  if (lastMsgDate !== today) {
    await writeContactToSheet({
      phone_number: contact.phone_number,
      chatId: contact.chatId,
      level: contact.level
    });
  }
    //===========================================================
      // Send the message
      const result = await forwardmessage(phone_number, message); 
      console.log({ resultttttttttttttttt: JSON.stringify(result, null, 2) });

      if (!result) { 
        throw new Error("Message could not be sent");
      }

      // Save the message
      const newMessage = new Message({
        contact_id: contact._id,
        message_id: result.messages[0].id,
        message,
        messageSenderName:req.user.userName,
        direction,
        timestamp: new Date(),
      });
      const savedMessage=await newMessage.save({ session });
      console.log({newMessage})
      // Update the contact with the latest message
      contact.last_message_id = newMessage._id;
      contact.lastMsgTime = newMessage.timestamp
      if (direction === 'received') {
        contact.unread_count += 1;
      }
      await contact.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: 'Message and contact updated successfully.',
        contact,
        savedMessage: savedMessage,
      });
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
        console.warn(`TransientTransactionError occurred. Retrying... (${retries + 1}/${MAX_RETRIES})`);
        retries += 1;
        await new Promise(resolve => setTimeout(resolve, 200)); 
      } else {
        console.error('Error occurred:', error);
        return res.status(500).json({ error: 'An error occurred while saving the message.' });
      }
    }
  }

  // If we exceed retries, return an error
  return res.status(500).json({ error: 'Transaction failed after multiple retries.' });
}); 
 
//to send template to the client i.e. first message 





// Fetch all contacts
// router.get('/contacts',authMiddleware, async (req, res) => {
//   try {
//     const contacts = await contact.find().populate('last_message_id');
//     res.status(200).json(contacts);
//   } catch (error) {
//     console.error('Error fetching contacts:', error);
//     res.status(500).send('Failed to fetch contacts');
//   }
// }); 

router.post('/replymessage',authMiddleware,async(req,res)=>{
    try{
      const {message_id} = req.body
        const result = await message.find({message_id})

      return res.status(200).json({
        success: true,
        message:result,
    });
    }catch(error){
      console.error(error);
      return res.status(500).json({
          success: false,
          error: 'An error occurred while fetching messages.',
      });
    }
})
// API to fetch last 40 messages for a contact
router.get('/messages/:contactId',authMiddleware, async (req, res) => {
  
  try {
    const { contactId } = req.params;
    const { skip , limit } = req.query;
    console.log({contactId})
      const messages = await message.find({ contact_id: contactId })
          .sort({ timestamp: -1 }) // Sort by time in decending order
          .skip(Number(skip)) // Skip the first N messages
        .limit(Number(limit));

      return res.status(200).json({
          success: true,
          messages:messages,
      });
  } catch (error) {
      console.error(error);
      return res.status(500).json({
          success: false,
          error: 'An error occurred while fetching messages.',
      });
  }
});


// API to get the image from Meta and send it to the frontend
router.get("/download-media/:id",authMiddleware, async (req, res) => {
  const mediaId = req.params.id;
  const token = process.env.WHATSAPP_ACCESS_TOKEN; // Replace with your actual access token
  console.log({mediaId})
  try {
    // Step 1: Get the media URL from Meta API
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        }, 
      } 
    );

    const mediaUrl = mediaUrlResponse.data.url;
    console.log({mediaUrl})
    // Step 2: Fetch the media binary data
    const mediaResponse = await axios.get(mediaUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: "stream", // For binary data
    }); 
    // Step 3: Determine the file extension from the content type
    const contentType = mediaResponse.headers["content-type"];
    
    const fileExtension = contentType.split("/")[1]; // Extract file extension
    
     // Step 4: Set the file type in a custom response header
     res.setHeader("X-File-Type", fileExtension); // Custom header for file type
 
     // Step 5: Pipe the media directly to the response (streaming to the client)
     res.setHeader("Content-Disposition", `attachment; filename=${mediaId}.${fileExtension}`);
     res.setHeader("Content-Type", contentType);
    mediaResponse.data.pipe(res);

    // writer.on("finish", () => {
    //   res.download(filePath, `${mediaId}.${fileExtension}`, (err) => {
    //     if (err) {
    //       console.error("Error downloading file:", err);
    //     }
    //     fs.unlinkSync(filePath); // Clean up file after sending
    //   });
    // });

    // writer.on("error", (err) => {
    //   console.error("Error writing file:", err);
    //   res.status(500).json({ error: "Failed to write file" });
    // });
  } catch (error) {
    console.error("Error fetching media:", error);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});
  
//too send hidden msg 
function sendHiddenMsg(text,chatid) {
  if (text === ".thanks") {
      return "*Thank you for the opportunity to work with you—it’s a pleasure assisting you! For any changes or future assignments, please don’t hesitate to reach out. Feel free to share my contact with friends who may need help with their assignments as well.*\n\n*Get $15 cashback for each successful referral!*";
  } else if (text === ".referral") {
      return `💸 *Earn $15 per Referral* 💸\n\nEarn *$15* for each friend who gives me using your referral code: *${chatid}*. Just share it—there’s no limit to how much you can earn!\n\nHappy sharing!`;
  } else {
      return text;
  }
}
//to sent TEXT message
async function sendMessage(to, message,chatid) {
  const result = await axios({
    url: `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
    method: 'post',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: message.type,
      text: {
        body:sendHiddenMsg(message.text.body,chatid)
      }
    })
  })
  return result.data; 
}


//to send template
async function sendTemplateMessage(to, templateName, languageCode, components = []) {
  try {
    console.log("comming...")
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
//to send MEdia message
//to sent TEXT message
async function forwardmessage(to, message) {
  console.log({to,message})
  // let msg= message
    // Step 2: Send media message
    const messageData =message.type === "text"?
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {   
        body:message.text.body,
        caption:message.text.caption ? message.text.caption : undefined,
      },
    }
    :
    message.type === "document"? {
      messaging_product: "whatsapp",
      to,
      type: message.type,
      [message.type]: {  
        filename:message[message.type].filename,
        id: message[message.type].id,
        caption: message.type === "image" || message.type === "video" ? message[message.type].caption : undefined,
      },
    }:
    {
      messaging_product: "whatsapp",
      to,
      type: message.type,
      [message.type]: {  
        id: message[message.type].id,
        caption: message.type === "image" || message.type === "video" ? message[message.type].caption : undefined,
      },
    }
    const result= await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      messageData,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    ); 
  return result.data;
}



// Get contacts with unread messages
router.get("/unread",authMiddleware, async (req, res) => {
  try {
    const unreadContacts = await Contact.find({ unread_count: { $ne: 0 } }) // Find contacts with unread messages
      .sort({ lastMsgTime: -1 }) // Sort by last message time (most recent first)
       
    res.status(200).json({
      success: true,
      data: unreadContacts,
      total: unreadContacts.length,
    });
  } catch (error) {
    console.error("Error fetching unread messages:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
//search in contact bar     
router.get('/searchcontact',authMiddleware, async (req, res) => {
  try {
    const searchTerm = req.query.q || ""; // The search term from the frontend
    const skip = parseInt(req.query.skip, 10) || 0; // Number of items to skip
    const limit = parseInt(req.query.limit, 10) || 30; // Number of items to return
    console.log({user:req.user.role})
    // Build the query
    const query = (req.user?.role && req.user?.role==="admin")?{
      $or: [ 
        { chatId: { $regex: searchTerm, $options: "i" } }, // Case-insensitive match
        { tutorID: { $regex: searchTerm, $options: "i" } },
        { name: { $regex: searchTerm, $options: "i" } },
        { phone_number: { $regex: searchTerm, $options: "i" } },
      ],
    }:
    {
      $or: [ 
        { chatId: { $regex: searchTerm, $options: "i" } }, // Case-insensitive match
        { tutorID: { $regex: searchTerm, $options: "i" } },
        { name: { $regex: searchTerm, $options: "i" } }, 
      ],
    };

    // Fetch results with pagination and sorting
    const results = await Contact.find(query)
      .sort({ pined: -1, lastMsgTime: -1 }) // Pinned first, then newest first
      .skip(skip)
      .limit(limit)
      .populate('last_message_id');

        // Encrypt phone numbers
        const encryptedResults = results.map(contact => ({
          ...contact._doc,
          phone_number: encryptFunction(contact.phone_number)
      }));

    // Send response
    res.status(200).json({
      success: true,
      data: encryptedResults,
      pagination: {
        skip,
        limit,
        total: await Contact.countDocuments(query),
      },
    });
  } catch (error) {
    console.error("Search API error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/contact/:id/brand", authMiddleware, async (req, res) => {
  try {
    const { brand } = req.body;

    const allowedBrands = ["", "NA", "AW", "GM", "AG", "IS", "MA", "GS", "TH"];

    if (!allowedBrands.includes(brand)) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand value",
      });
    }

    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      { brand },
      { new: true }
    );

    if (!updatedContact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Brand updated successfully",
      data: updatedContact,
    });
  } catch (error) {
    console.error("Error updating brand:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Update the "level" field for a contact
router.put("/contact/:id/level", authMiddleware, async (req, res) => {
  try {
    const { level } = req.body;

    const allowedLevels = [
      "new client",
      "old client",
      "tutor",
      "useless",
      "int_comm",
    ];

    if (!allowedLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        message: "Invalid level value",
      });
    }

    let contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    const finalChatId = contact.chatId;
    const finalTutorID = contact.tutorID;
    const finalPhone = contact.phone_number;

    let matchedTutor = null;
    let assignedTasks = [];

    // scan tutor by tutorID OR phone number
    matchedTutor = await Tutor.findOne({
      $or: [
        finalTutorID && finalTutorID !== "TI0000"
          ? { tutorID: finalTutorID }
          : null,

        finalPhone ? { phoneNumber: finalPhone } : null,

        finalPhone ? { phone_number: finalPhone } : null,
      ].filter(Boolean),
    });

    // if selected level is tutor and tutor found, save tutor details in contact
    const updateData = {
      level,
    };

    if (level === "tutor" && matchedTutor) {
      updateData.tutorID = matchedTutor.tutorID;
      updateData.name = matchedTutor.name || contact.name;
    }

    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // scan assigned tasks
    assignedTasks = await Task.find({
      $or: [
        finalChatId ? { clientID: finalChatId } : null,
        finalChatId ? { clientChatId: finalChatId } : null,
        finalChatId ? { chatId: finalChatId } : null,

        matchedTutor?.tutorID ? { tutorID: matchedTutor.tutorID } : null,
        matchedTutor?.tutorID ? { assignedTutorID: matchedTutor.tutorID } : null,
        matchedTutor?.tutorID ? { tutor: matchedTutor.tutorID } : null,

        finalPhone ? { phone_number: finalPhone } : null,
        finalPhone ? { phoneNumber: finalPhone } : null,
      ].filter(Boolean),
    }).limit(20);

    return res.status(200).json({
      success: true,
      message: "Level updated successfully",
      data: updatedContact,
      matched: {
        tutor: matchedTutor,
        assignedTasks,
      },
    });
  } catch (error) {
    console.error("Error updating level:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

// API to reset unread_count to 0
router.put('/contacts/:id/reset-unread',authMiddleware, async (req, res) => {
  try {
      const contactId = req.params.id;
    console.log({contactId})
      // Find the contact by ID and update unread_count
      const contact = await Contact.findByIdAndUpdate(
          contactId,
          { unread_count: 0 },
          { new: true } // Return the updated document
      );

      if (!contact) {
          return res.status(404).json({ message: 'Contact not found' });
      }

      res.status(200).json({
          message: 'Unread count reset to 0',
          contact,
      });
  } catch (error) {
      console.error('Error resetting unread count:', error);
      res.status(500).json({
          message: 'Internal Server Error',
          error: error.message,
      });
  }
});

router.put("/contacts/:id/mark-unread", authMiddleware, async (req, res) => {
  try {
    const contactId = req.params.id;

    console.log("MARK UNREAD API HIT:", contactId);

    const contact = await Contact.findByIdAndUpdate(
      contactId,
      { unread_count: 1 },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Marked as unread",
      contact,
    });
  } catch (error) {
    console.error("Error marking unread:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});
//Make a contact pined and remove from pined 
router.put("/toggle-pin/:_id",authMiddleware, async (req, res) => {
  try {
    const { _id } = req.params;

    // Find the contact
    const contact = await Contact.findOne({ _id });

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    // Toggle the `pined` field
    contact.pined = !contact.pined;

    await contact.save();

    res.json({ message: "Pin status updated successfully", contact });
  } catch (error) {
    console.error("Error toggling pin:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// API to delete a contact and all their messages
router.delete("/delete-contact/:_id",authMiddleware, async (req, res) => {
  try {
    const { _id } = req.params;

    // Find the contact
    const contact = await Contact.findById(_id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    if(req.user?.role && req.user?.role==="admin"){
      // Delete all messages related to this contact
      await Message.deleteMany({ contact_id: _id });
  
      // Delete the contact
      await Contact.findByIdAndDelete(_id);
  
      return res.json({ message: "Contact and all related messages deleted successfully" });
    }else{
      return res.json({ message: "Your are not an admin..." });
    }
  } catch (error) {
    console.error("Error deleting contact:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API to delete a contact's all chant 
router.delete("/delete-chat/:_id",authMiddleware, async (req, res) => {
  try {
    const { _id } = req.params;
    if(req.user?.role && req.user?.role==="admin"){

      // Delete all messages related to this contact
      await Message.deleteMany({ contact_id: _id });
   
      return res.json({ message: "Contact's all related messages deleted successfully" });
    }else{
      return res.json({ message: "You are not an admin..." });
    }
   
  } catch (error) {
    console.error("Error deleting contact:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}); 
  
// DELETE message by message_id
router.delete('/delete/:message_id',authMiddleware, async (req, res) => {
  try {
    const { message_id } = req.params;

    if(req.user?.role && req.user?.role==="admin"){
    // Find and delete the message
    const deletedMessage = await Message.findOneAndDelete({ message_id });

    if (!deletedMessage) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    res.status(200).json({ success: true, message: 'Message deleted successfully', data: deletedMessage });
    }else{
      return res.json({ message: "You are not an admin..." });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});



//to change the mark the jada pese wala clint or kam pese wala client

router.patch('/mark', async (req, res) => {
  try {
    const { chatId, mark } = req.body;
    console.log({ chatId, mark })
    // Validate `mark`
    const allowedMarks = ['bed', 'unknown','average', 'good'];
    if (!allowedMarks.includes(mark)) {
      return res.status(400).json({ error: 'Invalid mark value' });
    }

    // Update contact
    const contact = await Contact.findOneAndUpdate(
      { chatId }, // assuming chatId is unique
      { mark },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Mark updated successfully', contact });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
module.exports = router 