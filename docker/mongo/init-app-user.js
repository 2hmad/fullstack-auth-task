// Runs once, when the mongo container initialises an empty volume. The root user exists by then;
// this adds the only account the API uses: read and write on its own database, nothing else.
const { MONGO_INITDB_DATABASE, MONGO_APP_USERNAME, MONGO_APP_PASSWORD } = process.env;

for (const [name, value] of Object.entries({
  MONGO_INITDB_DATABASE,
  MONGO_APP_USERNAME,
  MONGO_APP_PASSWORD,
})) {
  if (!value) throw new Error(`${name} is not set`);
}

db.getSiblingDB(MONGO_INITDB_DATABASE).createUser({
  user: MONGO_APP_USERNAME,
  pwd: MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: MONGO_INITDB_DATABASE }],
});
