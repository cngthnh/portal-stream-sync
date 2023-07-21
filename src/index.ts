import app from "@/init";
import route from "@/routes";

const PORT = 3001;

route(app);

app.listen(PORT, () => {
    console.log(`Portal Service is listening at http://localhost:${PORT}`)
})