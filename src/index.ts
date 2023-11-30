//Imports Libraries
import express from 'express'
import Database from './database/database'
import MongodbDatabase from './database/mongoDbConnection'
import 'dotenv/config'

//Imports Routes
import usersRouter from './routes/users.routes'

//Config Server
const app = express()
const PORT = 3000

//Config Database
const database = Database.getInstance()
database.connect(new MongodbDatabase())

//Config Swagger

//Config Cron Jobs

//Config Middlewares
app.use(express.json())

//Implement Routes
app.use('/users', usersRouter)

//Server Running
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
