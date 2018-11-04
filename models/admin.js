var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose");
mongoose.connect("mongodb://localhost:27017/admin_db");

var AdminSchema = new mongoose.Schema({
    username: String,
    password: String
});

AdminSchema.plugin(passportLocalMongoose);
var Admin = mongoose.model("Admin", AdminSchema);
module.exports = Admin;

function addFakeAdmin() {
    Admin.create({
        username: "admin_username",
        password: "password"
    }, function (err, admin) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("Added admin " + admin.username);
        }
    });
}

function viewAdmins() {
    Admin.find({}, function (err, admins) {
        console.log(admins);
    });
}

function removeAdmin(username) {
    Admin.deleteOne({ username: username }, function (err) {
        if (err) {
            console.log(err);
        } 
        else {
            console.log("Removed Admin: " + username);
        }
    });
}

addFakeAdmin();
viewAdmins();
// removeAdmin("admin_username");