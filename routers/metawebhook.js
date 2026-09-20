const express = require('express');
const mongoose = require('mongoose');
const Contact = require('../models/contact'); // Contact schema
const Message = require('../models/message'); // Message schema
const axios = require('axios'); 
const router = express.Router();
const Task = require('../models/task')
const Tutor = require("../models/tutor"); 
 //write in googel sheet=====================================================
 const { google } = require('googleapis'); 
 const auth = new google.auth.GoogleAuth({
  keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function getIndianTime() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID_FOR_PERDAY_CHAT = "1uMe5wh96NIPa7Vtgl7_z4Z69c6zD1izlae0CEGWTItM";
const SPREADSHEET_ID_FOR_USER = "1WbEOBjDX6Jrbz5am1wyWwq-hff57_QnTYcMAEkMXvrU"; // Replace with your Google Sheet ID
const SPREADSHEET_ID_FOR_ADMIN = "1agsir_g1TcaCJ0dtuN_3DBInaD8ZpxMz9cVYxrBop8c"
async function writeSheetForUser(valuestowrite) {
  try {
    const sheets = google.sheets({ version: "v4", auth });

    // const response = await sheets.spreadsheets.get({
    //   spreadsheetId: SPREADSHEET_ID_FOR_USER,
    // });

    // console.log("✅ Available Sheets:", response.data.sheets.map(s => s.properties.title));
 
    // Prepare values to write
    const values = valuestowrite
 
    // Append the new data to the sheet (auto-finds next empty row)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_FOR_USER,
      range: "Shift Communication!A:D", // Adjust if necessary
      valueInputOption: "RAW",
      requestBody: { values: values },
    });

    console.log(`✅ Contact successfully written to Google Sheets`);
  } catch (error) {
    console.error("❌ Error writing to Google Sheets:", error);
  }
} 
async function writeSheetForAdmin(valuestowrite) {
   
    const sheets = google.sheets({ version: "v4", auth });

    // const response = await sheets.spreadsheets.get({
    //   spreadsheetId: SPREADSHEET_ID_FOR_ADMIN,
    // });

    // console.log("✅ Available Sheets:", response.data.sheets.map(s => s.properties.title));
 
  try {
    
    // Append the new data to the sheet (auto-finds next empty row)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_FOR_ADMIN,
      range: "New client details!A:C", // Adjust if necessary
      valueInputOption: "RAW",
      requestBody: { values: valuestowrite },
    });

    console.log(`✅ Contact successfully written to Google Sheets`);
  } catch (error) {
    console.error("❌ Error writing to Google Sheets:", error);
  }
}

// Test the function
// writeSheetForUser([["6567899", "CI3454", "demo",""]]);

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
 
 
// writeSheetForAdmin([["6567899", "CI3454", "demo"]]) 
// writeSheet([["", `testing device`, "", "CI0045", "NC"]])
//google sheet =======================================================
// Create an in-memory queue (no Redis required)
module.exports = (io) => {
  //======================================QUEUE============================================================
  class SimpleQueue {
    constructor({ jobTimeout = 30000, retryCount = 2 } = {}) {
      this.queue = [];
      this.isProcessing = false;
      this.jobTimeout = jobTimeout; // ms
      this.defaultRetries = retryCount;
    }

    // Add job to queue. Accepts an async function. Optional retries (defaults set in constructor).
    add(job, retries = this.defaultRetries) {
      // normalize to job object
      this.queue.push({ fn: job, retriesLeft: retries });
      // kick the processor
      this.processNext(); // Start processing if not already
    }

    // Internal helper to run a job with timeout
    _runWithTimeout(fn) {
      return Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Job Timeout')), this.jobTimeout))
      ]);
    }

    // Process jobs one by one
    async processNext() {
      if (this.isProcessing || this.queue.length === 0) return;

      this.isProcessing = true;
      const jobObj = this.queue.shift(); // { fn, retriesLeft }

      try {
        await this._runWithTimeout(jobObj.fn);
      } catch (error) {
        console.error('Job attempt failed:', error.message);
        // If retries remain, decrement and re-queue at the end
        if (jobObj.retriesLeft > 0) {
          jobObj.retriesLeft -= 1;
          console.log(`Re-queueing job, retries left: ${jobObj.retriesLeft}`);
          this.queue.push(jobObj);
        } else {
          console.error('Job exhausted retries and will be dropped.');
        }
      } finally {
        this.isProcessing = false;
        // small delay before processing next job to avoid tight loops
        setTimeout(() => this.processNext(), 200);
      }
    }
  }
  // Create queue with a longer timeout and a couple of retries for slow media jobs
  const queue = new SimpleQueue({ jobTimeout: 30000, retryCount: 2 });
// const arr=["lala","kala","krishna","rama","gauranga","balaram"]
 
//   const test=()=>{ 
//     queue.add(async () => {
//       console.log(`Processing message from  ${arr[0]}`);
      
//     });
//     queue.add(async () => {
//       console.log(`Processing message from  ${arr[1]}`);
//       await new Promise((resolve) => setTimeout(resolve, 3000));
//     });
//     queue.add(async () => {
//       console.log(`Processing message from  ${arr[2]}`);
//       await new Promise((resolve) => setTimeout(resolve, 3000));
//     });
//     queue.add(async () => {
//       console.log(`Processing message from  ${arr[3]}`);
//       await new Promise((resolve) => setTimeout(resolve, 3000));
//     });
//     queue.add(async () => {
//       console.log(`Processing message from  ${arr[4]}`);
//       await new Promise((resolve) => setTimeout(resolve, 3000));
//     });
//     queue.add(async () => {
//       console.log(`Processing message from  ${arr[5]}`);
//       await new Promise((resolve) => setTimeout(resolve, 3000));
//     }); 
//   }
//   test()
// async function addMessageToQueue(messages, contactInfo) {
//   const job = await messageQueue.add(
//     'newMessage',  // Job Name
//     { messages, contactInfo },  // Job Data
//     {
//       jobId: messages.id,  // Custom Job ID (optional)
//       removeOnComplete: true,  
//       removeOnFail: true 
//     }
//   );}
// const worker = new Worker('messageQueue', async (job) => {
//     console.log('Processing job:', job.id, job.data);
//     // Your message processing logic here
//   }, { connection: {} });  // No Redis, use in-memory mode
  
//   worker.on('completed', (job) => {
//     console.log(`✅ Job ${job.id} completed.`);
//   });
  
//   worker.on('failed', (job, err) => {
//     console.error(`❌ Job ${job.id} failed:`, err);
//   });
//=============================================================================================================
// Handle the webhook route
router.get('/', (req, res) => {
  const statusUpdate = {
    name:"lalan",
    status:"true"
  }; // Assuming Meta sends status updates in the request body
  // Emit the status update to all connected clients
  io.emit('statusUpdate', statusUpdate);

  // Respond to the webhook with a 200 status
  res.sendStatus(200);
});

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const challenge = req.query['hub.challenge']
  const token = req.query['hub.verify_token']
 
  if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge)
  } else {
    res.sendStatus(403)
  }
})

router.post('/webhook', async (req, res) => {
  const { entry } = req.body 
  console.log(JSON.stringify(entry, null, 2))
  if (!entry || entry.length === 0) {
    return res.status(400).send('Invalid Request')
  }

  const changes = entry[0].changes

  if (!changes || changes.length === 0) {
    return res.status(400).send('Invalid Request')
  }

  const statuses = changes[0].value.statuses ? changes[0].value.statuses[0] : null
  const messages = changes[0].value.messages ? changes[0].value.messages[0] : null
  const contactInfo = changes[0].value.contacts ? changes[0].value.contacts[0] : null

  if(statuses) {
  if(statuses?.errors){
    const messages={
      from: statuses.recipient_id,     //ye conatact no h 
      id: statuses.id,
      timestamp: statuses.timestamp,  // ye time h 
      text: {
        body: `*ERROR*: ${statuses?.errors[0]?.code}\n${statuses?.errors[0]?.error_data?.details}`||"ERROR:-\nMedia File has arrived.\n Unable to detact."   //ye message h
      },
      type: "text"   //ye msg type h 
    }
    const contactInfo =  {
      profile: {
        name: "Unknown"
      },
      wa_id: statuses.recipient_id
    }
    queue.add(async () => { 
      await receivedError(messages,contactInfo)
    });
    
  }else{ 
      queue.add(async () => {
        console.log(`Updating status: ${statuses.id} -> ${statuses.status}`);
        await updateMessageStatus(statuses.id, statuses.status);
      });
  }
    // console.log(`
    //   MESSAGE STATUS UPDATE:
    //   ID: ${statuses.id},
    //   STATUS: ${statuses.status}
    // `)
  } 

  if (messages) { 
    // Handle received messages
    // console.log({messages})
    if(messages.type==="interactive"){
      queue.add(async () => {
        console.log(`Processing message from ${contactInfo.wa_id}`);
        await saveInteractiveMessage(messages,contactInfo)
      });
      
    } else{
      queue.add(async () => {
        console.log(`Processing message from ${contactInfo.wa_id}`);
        await receivedMessage(messages, contactInfo);
      });
    }
    if (messages.type === 'text') { 
      if (messages.text.body.toLowerCase() === 'hello') {
       // replyMessage(messages.from, 'Hello. How are you?', messages.id)
      }

      if (messages.text.body.toLowerCase() === 'list') {
      //  sendList(messages.from)
      }

      if (messages.text.body.toLowerCase() === 'buttons') {
       // sendReplyButtons(messages.from)
      }
    }

    if (messages.type === 'interactive') {
      if (messages.interactive.type === 'list_reply') {
       // sendMessage(messages.from, `You selected the option with ID ${messages.interactive.list_reply.id} - Title ${messages.interactive.list_reply.title}`)
      }

      if (messages.interactive.type === 'button_reply') {
       // sendMessage(messages.from, `You selected the button with ID ${messages.interactive.button_reply.id} - Title ${messages.interactive.button_reply.title}`)
      }
    }

    // console.log(JSON.stringify(messages, null, 2))
  }

  res.status(200).send('Webhook processed')
})
 
  //if i try to send TEXT to new/24hr passed user=================IMPORTANT==============================================================================

 
  // Pseudo-code for queuing webhook updates
  const updateMessageStatus = async (messageId, status) => {
    try {
      let retries = 5;
      let message = null;
  
      // Retry logic: Check if the message exists before updating
      while (retries > 0) {
        message = await Message.findOne({ message_id: messageId });
        if (message) break;
        retries--;
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay 1 second
      }
  
      if (!message) {
        console.error(`Message with ID ${messageId} not found after retries.`);
        return;
      }
  
      let updatedMessage;
  
      // If the status is "failed", set it to -1
      if (status === "failed") {
        updatedMessage = await Message.findOneAndUpdate(
          { message_id: messageId },
          { status: -1 },
          { new: true }
        );
  
        if (updatedMessage) {
          if (updatedMessage.status === 0) updatedMessage.status = -1;
          io.emit("messageStatus", updatedMessage);
        } else {
          console.error(`Failed to update message ID ${messageId} to failed status.`);
        }
        return;
      }
  
      // For other statuses, increment status
      updatedMessage = await Message.findOneAndUpdate(
        { message_id: messageId },
        { $inc: { status: 1 } }, // Increment the status field
        { new: true }
      );
  
      if (updatedMessage) {
        io.emit("messageStatus", updatedMessage);
      } else {
        console.error(`Failed to update message ID ${messageId}.`);
      }
  
      // Simulate database save delay
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error updating message status: ${error.message}`);
    }
  };
  
  // const updateMessageStatus = async (messageId,status) => {

  //   let statust= status

  //   //Status is failed then due too 24hr passed 
  //   if(statust==="failed"){
  //     let message = null;
  //     let retries = 5;
  //     while (retries > 0) { 
    
  //       message = await Message.findOne( { message_id:messageId});
  //       if (message) break;
  //       retries--;
  //       await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay 1 second
  //     }
    
  //     // If the message exists, update its status
  //     if (message) {
  //      const resp= await Message.findOneAndUpdate(
  //        { message_id:messageId},
  //         { status: -1 },
  //         { new: true }
  //       ); 
  //       if(resp.status==0)resp.status=-1;
  //       io.emit('messageStatus', resp);
  //     } else {
  //       console.error(`Message with ID ${messageId} not found after retries.`);
  //     }
  //     return;
  //   }
  //     // Retry logic: Check if the message exists
  //     let message = null;
  //     let retries = 5;
  //     while (retries > 0) { 
    
  //       message = await Message.findOne( { message_id:messageId});
  //       if (message) break;
  //       retries--;
  //       await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay 1 second
  //     }
    
  //     // If the message exists, update its status
  //     if (message && statust!=="failed") {
  //      const resp= await Message.findOneAndUpdate(
  //        { message_id:messageId},
  //        { $inc: { status: 1 } },   // Increment the `status` field by 1
  //        { new: true }
  //       ); 
  //       io.emit('messageStatus', resp);
  //     } else {
  //       console.error(`Message with ID ${messageId} not found after retries.`);
  //     }
  //      // Simulate database save delay
  //     await new Promise((resolve) => setTimeout(resolve, 500));
  //   };



  //this function is to just provide me media url to download the media 
  const fetchMediaUrl = async (mediaId) => {
    const response = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
            }
        }
    );
    const data = await response.json();
    console.log({urlData:data})
    if (data.url) {
        return data.url; // This is a pre-signed URL for downloading the media.
    }
    throw new Error('Failed to fetch media URL');
};


async function cleanMessage(message) {
  // Check if 'context' exists and remove 'context.from' if present
  if (message.context && message.context.from) {
      delete message.context.from;
  } 
  delete message.from;
  delete message.id;
  delete message.timestamp;
 

  return message;
}



// async function receivedMessage(messages,contactInfo){
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try { 
//     // 1. Find or create the contact based on phone number
//     let contact = await Contact.findOne({ phone_number: `+${contactInfo.wa_id}` }).session(session);

//     if (!contact) {
//       // If contact doesn't exist, create a new contact
//       contact = new Contact({
//         name: contactInfo.profile.name, // Default name if not provided
//         phone_number: `+${contactInfo.wa_id}`,
//       });
//       await contact.save({ session });
//     }
//     let messageId = messages.id
//     // let commingMessage=messages
//     let msg=await cleanMessage(messages)
//     console.log({msgllll:msg})
//     // 2. Save the message
//     const newMessage = new Message({
//       contact_id: contact._id,
//       message_id: messageId, // Use timestamp or message ID provided by Meta webhook
//       message:msg,
//       direction: 'received' // As it's an incoming message
//     });
//    const savedMessage= await newMessage.save({ session });

//     // 3. Update the contact with the latest message ID and unread count
//     contact.last_message_id = newMessage._id;
//     contact.unread_count += 1; // Increment unread count
//     await contact.save({ session });

//     // Commit the transaction
//     await session.commitTransaction();
//     session.endSession();
 
//     io.emit('newMessageReceived', {
//       message: 'Message and contact updated successfully.',
//       contact,
//       savedMessage,
//     });
//   } catch (error) {
//     // Abort the transaction on error
//     await session.abortTransaction();
//     session.endSession();

//     console.error(error);
//     console.log({ error: 'An error occurred while saving the message.' });
//   }


// }


//To Save message for new and existing users
async function receivedMessage(messages, contactInfo) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try { 
    // console.log({contact:`+${contactInfo.wa_id}`})
    // 1. Find or create the contact based on phone number
    let contact = await Contact.findOne({ phone_number: `+${contactInfo.wa_id}` }).session(session);
  
    if (!contact) {
      let tutor = await Tutor.findOne({phoneNumber:`+${contactInfo.wa_id}`}).session(session)
      // If contact doesn't exist, create a new one
      let lastContact = await Contact.findOne().sort({ chatId: -1 }).session(session);
      let newChatId = lastContact ? `CI${(parseInt(lastContact.chatId.slice(2)) + 1).toString().padStart(4, '0')}` : 'CI0001';
      // console.log({newChatId})
      // If contact doesn't exist, create a new contact
      contact = new Contact({
        chatId: newChatId,
        tutorID:tutor?tutor.tutorID:"TI0000",
        name: contactInfo.profile.name,
        phone_number: `+${contactInfo.wa_id}`,
      });
      // if(!tutor){
      //   //SEND YOU GOOGLE FORM LINK HERE TO KNOW HOW DID YOU COME TO KNOW ABOUT US
      //   // sendWhatsAppListMessage(contactInfo.wa_id)
      //   sendWhatsAppTextMessage(contactInfo.wa_id, `Hello!!\nTo get updates regarding your *Task* and *Future Offers*, please fill out this *Mandatory Form*:\n\nhttps://docs.google.com/forms/d/e/1FAIpQLSe0AHauz5eJpuifoenWpUaxrNNMB9VxiyLGoMiSF1opAzM29A/viewform?usp=pp_url&entry.1414236200=${newChatId}`)
      //   messages.text.body+=`\n\n\n\n📍📍*Important and Urgent*📍📍!!\n_Get the form filled out by the client_`;
      // }
      // Save the new contact in the session
      await contact.save({ session });
      const msg= messages.text.body
     if(contact.tutorID==="TI0000"){ 
     await writeSheetForUser([["","", newChatId, "NC"]])
     delay(300)
      writeSheetForAdmin([[ msg, newChatId, "NC"]])
    }
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
    // Continue to save the message for the contact
    let messageId = messages.id;
    let msg = await cleanMessage(messages);

    // 2. Save the message
    const newMessage = new Message({
      contact_id: contact._id,
      message_id: messageId,
      message: msg,
      direction: 'received'
    });

    const savedMessage = await newMessage.save({ session });

    // 3. Update the contact with the latest message ID and unread count
    contact.last_message_id = newMessage._id;
    contact.lastMsgTime = new Date()
    contact.unread_count += 1;
    await contact.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    io.emit('newMessageReceived', {
      message: 'Message and contact updated successfully.',
      contact,
      savedMessage,
    });

    if(messages.type==="text")checkForIntrestedPeople(messages?.text?.body,contact)
  } catch (error) {
    // Abort the transaction on error
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    console.log({ error: 'An error occurred while saving the message.' });
  }
   // Simulate database save delay
   await new Promise((resolve) => setTimeout(resolve, 800));
}

//To Save message for new and existing users
async function receivedError(messages, contactInfo) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try { 
    // console.log({contact:`+${contactInfo.wa_id}`})
    // 1. Find or create the contact based on phone number
    let contact = await Contact.findOne({ phone_number: `+${contactInfo.wa_id}` }).session(session);

    if (!contact) {
      let tutor = await Tutor.findOne({phoneNumber:`+${contactInfo.wa_id}`}).session(session)
      // If contact doesn't exist, create a new one
      let lastContact = await Contact.findOne().sort({ chatId: -1 }).session(session);
      let newChatId = lastContact ? `CI${(parseInt(lastContact.chatId.slice(2)) + 1).toString().padStart(4, '0')}` : 'CI0001';
      // console.log({newChatId})
      // If contact doesn't exist, create a new contact
      contact = new Contact({
        chatId: newChatId,
        tutorID:tutor?tutor.tutorID:"TI0000",
        name: contactInfo.profile.name,
        phone_number: `+${contactInfo.wa_id}`,
      });

      // Save the new contact in the session
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
       //===========================================================

    // Continue to save the message for the contact
    let messageId = messages.id;
    let msg = await cleanMessage(messages);

    // 2. Save the message
    const newMessage = new Message({
      contact_id: contact._id,
      message_id: messageId,
      message: msg,
      direction: 'both'
    });

    const savedMessage = await newMessage.save({ session });

    // 3. Update the contact with the latest message ID and unread count
    contact.last_message_id = newMessage._id;
    contact.lastMsgTime = new Date()
    contact.unread_count += 1;
    await contact.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    io.emit('newMessageReceived', {
      message: 'Message and contact updated successfully.',
      contact,
      savedMessage,
    });

  } catch (error) {
    // Abort the transaction on error
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    console.log({ error: 'An error occurred while saving the message.' });
  }

   // Simulate database save delay
   await new Promise((resolve) => setTimeout(resolve, 300));
}

async function saveMessage() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { phone_number, message, direction } = req.body;

    if (!phone_number || !message || !direction) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Find the contact by phone number
    let contact = await Contact.findOne({ phone_number }).session(session);

    // If contact does not exist, create a new contact
    if (!contact) {
      contact = new Contact({ name: 'Unknown', phone_number });
      await contact.save({ session });
    }

    // Save the message
    const newMessage = new Message({
      contact_id: contact._id,
      message,
      direction,
      timestamp: new Date(),
    });
    await newMessage.save({ session });

    // Update the contact with the latest message
    contact.last_message_id = newMessage._id;
    contact.last_active = new Date();
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
      savedMessage: newMessage,
    });
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();

    console.error(error);
    return res.status(500).json({ error: 'An error occurred while saving the message.' });
  }
};

// Function to send list message to the user
async function sendWhatsAppListMessage(clientPhoneNumber) {
 
  // Message data to send
  const messageData = {
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": clientPhoneNumber,
    "type": "interactive",
    "interactive": {
      "type": "list",
      "header": {
        "type": "text",
        "text": "How did you find us?"
      },
      "body": {
        "text": "Please select an option below:"
      },
      "footer": {
        "text": "This will help us improve our services."
      },
      "action": {
        "button": "Select Platform",
        "sections": [
          {
            "title": "Messaging Platforms",
            "rows": [
              {
                "id": "whatsapp_group",
                "title": "WhatsApp Groups",
                "description": "Joined via a WhatsApp group"
              },
              {
                "id": "telegram_group",
                "title": "Telegram Groups",
                "description": "Joined via a Telegram group"
              },
              {
                "id": "facebook_group",
                "title": "Facebook Groups",
                "description": "Joined via a Facebook group"
              }
            ]
          },
          {
            "title": "Social Media & Ads",
            "rows": [ 
              {
                "id": "facebook_ad",
                "title": "Facebook Ads",
                "description": "Clicked on our Facebook Ad"
              },
              {
                "id": "instagram_ad",
                "title": "Instagram Ads",
                "description": "Clicked on our Instagram Ad"
              },
              {
                "id": "google_ad",
                "title": "Google Ads",
                "description": "Found us through Google Ads"
              }
            ]
          },
         
          {
            "title": "Other Sources",
            "rows": [
              {
                "id": "friend",
                "title": "Through Friends",
                "description": "A friend recommended us"
              },
              {
                "id": "other",
                "title": "Others",
                "description": "Different source"
              }
            ]
          }
        ]
      }
    }
  };

  try {
    console.log("list sent")
    // Send the request to WhatsApp API
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      messageData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

// Function to send simple text message
async function sendWhatsAppTextMessage(clientPhoneNumber, textMessage) {
  // Message data to send
  const messageData = {
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": clientPhoneNumber,
    "type": "text",
    "text": {
      "body": textMessage
    }
  };

  try {
    console.log(`Sending text message to ${clientPhoneNumber}`);
    
    // Send the request to WhatsApp API
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      messageData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Text message sent successfully:', response.data);
    return response.data; // Return response for further processing if needed
    
  } catch (error) {
    console.error('Error sending text message:', error.response ? error.response.data : error.message);
    throw error; // Re-throw error so caller can handle it
  }
}

// sendWhatsAppListMessage("+917073437393")
// sendWhatsAppListMessage("+916205792302")
  // sendWhatsAppTextMessage("+916205792302", `Hello!!\nTo proceed further, please fill out this mandatory form:\n\nhttps://docs.google.com/forms/d/e/1FAIpQLSe0AHauz5eJpuifoenWpUaxrNNMB9VxiyLGoMiSF1opAzM29A/viewform?usp=pp_url&entry.1414236200=lalan`)
// Function to handle saving interactive message details and updating the 'comeThrough' field
async function saveInteractiveMessage(message, contactInfo) {
  try {
    // Extract the necessary fields from the message and contactInfo
    const contactNumber = contactInfo?.wa_id; // Assuming wa_id is the WhatsApp number
    const messageTitle = message?.interactive?.list_reply?.title;
    console.log({contactNumber,messageTitle})
    if (!contactNumber || !messageTitle) {
      console.error('Invalid message or contact info');
      return;
    }

    // Search for the contact by contact number
    const contact = await Contact.findOne({ phone_number: `+${contactNumber}`});

    if (!contact) {
      console.log('Contact not found');
      return;
    }

    // Update the 'comeThrough' section of the contact schema with the message title
    contact.comeThrough = messageTitle;

    // Save the updated contact document
    await contact.save();

    console.log('Contact updated successfully with comeThrough info');
  } catch (error) {
    console.error('Error saving interactive message:', error.message);
  }
}


const findTaskID = async (msg) => {
  try {
    const taskIdMatch = msg.match(/with\s+TaskID:-\s*(\w+)/i);

    if (taskIdMatch && taskIdMatch[1]) {
      return taskIdMatch[1].trim();
    } else {
      return null; // returning null instead of 0 for clarity
    }
  } catch (error) {
    console.error("Error in findTaskID:", error.message);
    return null;
  }
};
const checkForIntrestedPeople = async (msg, contact) => {
  try {
    const taskID =await findTaskID(msg);
    console.log({taskID})
    if(!taskID){console.log("Invalid TaskId"); return;}
    const task = await Task.findOne({ taskID });

    if (!task) {
      console.log(`Task with ID ${taskID} not found.`);
      return;
    }

    // Ensure array is initialized
    if (!Array.isArray(task.intrestedTutors)) {
      task.intrestedTutors = [];
    }

    const alreadyExists = task.intrestedTutors.some(
      (tutor) => tutor.chatId === contact.chatId
    );

    if (!alreadyExists) {
      task.intrestedTutors.push({
        name: contact.name,
        tutorID: contact.tutorID,
        chatId: contact.chatId,
      });

      await task.save();
      io.emit('intrestShown', {
         taskID,
         intrestedPerson:{
          name: contact.name,
          tutorID: contact.tutorID,
          chatId: contact.chatId,
         }
      });
      console.log('Tutor added to interestedTutors.');
    } else {
      console.log('Tutor already exists in interestedTutors.');
    }
  } catch (error) {
    console.error('Error in checkForIntrestedPeople:', error.message);
  }
};
   
// checkForIntrestedPeople("I am interested in this Task with TaskID:- TICI06950001",{name:"Testing", tutorID:"TItest", chatId:"CItest1b"})
                            
// sendWhatsAppListMessage("916205792302") 
return router;
};

// module.exports = router; 