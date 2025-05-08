const express = require('express')
const cors = require('cors')
const app = express()
const PORT = 3002

const uploadRouter = require('./Router/upload')
const controlRouter = require('./Router/control')

app.use(cors())
app.use(express.json())

app.use('/', uploadRouter)
app.use('/', controlRouter)

app.listen(PORT, () => {
    console.log(`✅ Slave server is running on port ${PORT}`)
})
