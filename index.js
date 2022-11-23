const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.port || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ptacj7j.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){

    const authHeader = req.headers.authorization;
   
    if(!authHeader){
        return res.status(401).send('unauthoruzed access');
    }

    const token = authHeader.split(' ')[1];
    

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        console.log(err);
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
    try{
        const appointmentOptionCollection = client.db('dentalPortal').collection('service');
        const bookingsCollection = client.db('dentalPortal').collection('bookings');
        const usersCollection = client.db('dentalPortal').collection('users');
        const doctorsCollection = client.db('dentalPortal').collection('doctors');


        // NOTE: make sure you use verifyAdmin after verifyJwt 
        const verifyAdmin = async (req, res, next) =>{
            console.log('inside verifyAdmin', req.decoded.email)
            const decodedEmail = req.decoded.email;
            const query = {email: decodedEmail};
            const user = await usersCollection.findOne(query);

            if(user?.role !== 'admin'){
                return res.status(403).send({message: 'forbidden access'})
            }
            next();
        }

        
        app.get('/appointmentSpecialty', async(Req, res) =>{
            const query ={}
            const result = await appointmentOptionCollection.find(query).project({name: 1}).toArray();
            res.send(result);
        });

        app.get('/service', async(req, res) => {
            const date = req.query.date;
            const query ={};
            const options = await appointmentOptionCollection.find(query).toArray();

            // get the booking of the provided date 
            const bookingQuery ={appointmentDate: date}
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot)
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;

            })
            res.send(options);
        })


        /*
        *api naming convention
        * app.get('/bookings')
        * app.get('/booking/:id')
        * app.post('bookings')
        * app.patch('/booking/:id')
        * app.delete('/booking/:id)
        */ 

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            console.log(email);
            const decodedEmail = req.decoded.email;

            if(email != decodedEmail){
                return res.status(403).send({message: 'forbidden access'})
            }
            const query = {email: email};
            const bookings = await bookingsCollection.find(query).toArray();
            // console.log(bookings);
            res.send(bookings);
        });

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id)};
            const booking = await bookingsCollection.findOne(query);
            res.send(booking)
        })

        app.post('/bookings', async(req, res) =>{
            const booking =req.body
            console.log(booking);
            const query ={
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if(alreadyBooked.length){
                const message =`you already have a booking on ${booking.appointmentDate}`
                return res.send({acknowledged: false, message})
            }
            const result = await  bookingsCollection.insertOne(booking);
            res.send(result);
        });

        app.get('/jwt', async(req, res) =>{
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'});
                return res.send({accessToken: token});
            }
            console.log(user);  
            res.send(403)({accessToken: ''})  
        });

        app.get('/users', async(req, res) =>{
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        app.get('/users/admin/:email', async (req, res) =>{
            const email = req.params.email;
            const query = {email}
            const user = await usersCollection.findOne(query);
            res.send({isAdmin: user?.role === 'admin'});
        })

        app.post('/users', async(req, res) =>{
            const user =req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);    
        })

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) =>{
            const id = req.params.id;
            const filter = {_id:ObjectId(id)}
            const options = {upsert: true};
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        app.get('/addPrice', async (req, res) =>{
            const filter = {}
            const options = { upsert: true}
            const updateDoc = {
                $set: {
                    price:99
                }
            }
            const result = await appointmentOptionCollection.updateMany(filter,updateDoc, options );
            res.send(result);
        })

        // get doctor 
        app.get('/doctors', verifyJWT, verifyAdmin, async(req, res) =>{
            const query ={};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        })

            // create doctor 
        app.post('/doctors', verifyJWT, verifyAdmin, async(req, res) =>{
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        });

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const result = await doctorsCollection.deleteOne(filter);
        })
    }
    finally{
        
    }
}
run().catch(console.log);


app.get('/', async(req, res) =>{
    res.send('doctors portal server');
})

app.listen(port, () => console.log(`Doctors portal running on ${port}`));