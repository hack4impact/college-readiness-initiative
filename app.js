var express       = require("express"),
    mongoose      = require("mongoose"),
    passport      = require("passport"),
    bodyParser    = require("body-parser"),
    Student       = require("./models/student"),
    Admin         = require("./models/admin"),
    Tutor         = require("./models/tutor"),
    Session       = require("./models/session"),
    Question      = require("./models/question")
    School        = require("./models/school"),
    LocalStrategy = require("passport-local"),
    parseCSV      = require("./scripts/parseCSV"),
    uploadSchool  = require("./scripts/uploadSchool"),
    insertStudentQs = require("./scripts/insertNewStudentQuestions"),
    moveCompletedQ = require("./scripts/moveCompletedQuestion"),
    fs            = require('fs'),
    path          = require('path'), // needed for image paths
    async         = require('async');

mongoose.connect('mongodb://localhost:27017/college_readiness_initiative', { useNewUrlParser: true });

mongoose.Promise = global.Promise;

var app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended: true}));

// PASSPORT CONFIGURATION
app.use(require("express-session")({
  secret: "any string can go here",
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static("public"));
app.use(express.static("/images")); //needed for express to display images

passport.use('student', new LocalStrategy(Student.authenticate()));
passport.serializeUser(Student.serializeUser());
passport.deserializeUser(Student.deserializeUser());

passport.use('tutor', new LocalStrategy(Tutor.authenticate()));
passport.serializeUser(Tutor.serializeUser());
passport.deserializeUser(Tutor.deserializeUser());

passport.use('admin', new LocalStrategy(Admin.authenticate()));
passport.serializeUser(Admin.serializeUser());
passport.deserializeUser(Admin.deserializeUser());

app.use(function (req, res, next) {
  res.locals.currentUser = req.user;
  // console.log("current user: " + req.user);
  next();
});

// Images
app.get('/images/:image', function (req, res, next) {
  res.sendfile(path.join(__dirname, 'images', req.params.image))
})

// Home page route
app.get("/", function (req, res) {
  res.render("home");
})

// Practice page
// Allows student to select type
app.get("/practicetype", isLoggedIn, function(req, res) {
  Question.find().distinct('type', function(err, questionTypes) {
    res.render("practicetype", {questionTypes: questionTypes});
  });
})

// About page route
app.get("/about", function (req, res) {
  res.render("about");
})
// Board members page route
app.get("/boardmembers", function (req, res) {
  res.render("boardmembers");
})

fs.readdirSync(__dirname + '/models').forEach(function(filename) {
    if(~filename.indexOf('.js')) require(__dirname + '/models/' + filename)
})

// Answer Keys page route
app.get("/answerkeys", function(req, res) {
    Question.find(function(err, questions) {
        res.render("answerkeys", {questions: questions});
    });
})

app.get("/studentlist", function(req, res) {
    Student.find(function(err, students) {
        res.render("studentlist", {students: students});
    })
})

// Tutoring Page (Ask student whether they are with a tutor)
app.get("/tutoring", function(req, res) {
    res.render("tutoring");
})

// SAT Prep Page
app.get("/satprep", function (req, res) {
  res.render("satprep");
})

// Question page
app.get("/question/:type", isLoggedIn, function (req, res) {
  var questionType = req.params.type;
  if (questionType == "solving equation expression") {
    questionType = "solving_equation_expression";
  }
  else if (questionType == "word problem") {
    questionType = "word_problem";
  }
  if (req.user.current_questions[questionType].length == 0) {
    // No questions left to do of this type
    res.render("completedQuestionType", { type: req.params.type });
  }
  else {
    var questionId = req.user.current_questions[questionType][0];
    Question.findOne({ _id: questionId }, function (err, question) {
      if (err) console.log(err);
      console.log(question);
      res.render("question", { question: question, link: req.params.type });
    });
  }
})

// Post method that redirects to solution page
app.post("/question/:type", isLoggedIn, processAnswer, renderSolution);

function processAnswer(req, res, next) {
  req.type = req.params.type;
  if (req.type == "solving equation expression") {
    req.type = "solving_equation_expression";
  }
  else if (req.type == "word problem") {
    req.type = "word_problem";
  }
  if (req.body.answerMC != null) {
    req.answer = req.body.answerMC;
    console.log("answerMC: " + req.answer)
  }
  else {
    req.answer = req.body.answerInput;
    console.log("shortAns " + req.answer);
  }
  return next();
}

function renderSolution(req, res) {
  var answer = req.answer;
  var type = req.type;
  var questionId = req.user.current_questions[type][0];
  Question.findOne({ _id: questionId }, function (err, question) {
    if (err) console.log(err);
    console.log("solution: " + question.answer);
    console.log("inputted answer: " + answer);
    if (question.answer == answer) {
      res.render("correctSolution", { question: question, type: type, answer: answer });
    }
    else {
      res.render("incorrectSolution", { question: question, type: type, answer: answer });
    }
  });
} 

app.post("/correctsolution/:type", function(req, res) {
  var questionType = req.params.type;
  var studentId = req.user._id;
  moveCompletedQ(studentId, questionType, true);
  res.redirect("question/" + questionType);
})

app.post("/incorrectsolution/:type", function (req, res) {
  var questionType = req.params.type;
  var studentId = req.user._id;
  moveCompletedQ(studentId, questionType, false);
  res.redirect("question/" + questionType);
})

app.get("/review/:type", isLoggedIn, function(req, res) {
  var questionType = req.params.type;
  var missed_Ids = req.user.missed_questions;
  getMissedQuestions(missed_Ids).then(function (missed_qArr) {
    var missed_qs = missed_qArr;
    console.log("here!");
    console.log(missed_qs);
    res.render("review", { questionType: questionType, missed_qs: missed_qs });
  });
})

async function getMissedQuestions(missed_Ids) {
  missed_qs = []
  for (const missedId of missed_Ids) {
    await Question.findById(missedId._id, function (err, question) {
      if (err) console.log(err);
      else {
        if (question != null) {
          missed_qs.push(question);
        }
      }
    });
  }
  return missed_qs;
}


// Full Practice Test Page
app.get("/fulltests", function (req, res) {
  res.render("fulltests");
})

app.get('/files/fulltests/:testnum', function (req, res) {
  var filePath = "/files/fulltests/" + req.params.testnum;
  fs.readFile(__dirname + filePath, function (err, data) {
    res.contentType("application/pdf");
    res.send(data);
  });
})

// Math Practice Page
app.get("/mathpractice", function (req, res) {
  res.render("math.ejs");
})

app.get('/files/math/tutorialsandworksheets/:folder/:worksheet', function (req, res) {
  var filePath = "/files/math/tutorialsandworksheets/" + req.params.folder + "/" + req.params.worksheet;
  fs.readFile(__dirname + filePath, function (err, data) {
    res.contentType("application/pdf");
    res.send(data);
  });
})

app.get('/files/math/:folder/:worksheetnum', function (req, res) {
  var filePath = "/files/math/" + req.params.folder + "/" + req.params.worksheetnum;
  fs.readFile(__dirname + filePath, function (err, data) {
    res.contentType("application/pdf");
    res.send(data);
  });
})

// Reading Practice Page
app.get("/readingpractice", function (req, res) {
  res.render("reading.ejs");
})
app.get('/files/reading/:practicenum', function (req, res) {
  var filePath = "/files/reading/" + req.params.practicenum;
  fs.readFile(__dirname + filePath, function (err, data) {
    res.contentType("application/pdf");
    res.send(data);
  });
})

// Writing and Language Practice Page
app.get("/writingpractice", function (req, res) {
  res.render("writing.ejs");
})
app.get('/files/writing/:practicenum', function (req, res) {
  var filePath = "/files/writing/" + req.params.practicenum;
  fs.readFile(__dirname + filePath, function (err, data) {
    res.contentType("application/pdf");
    res.send(data);
  });
})

// SOL Prep Page
app.get("/solprep", function (req, res) {
  res.render("solprep");
})
app.get('/files/sol/:pdf', function (req, res) {
  var filePath = "/files/sol/" + req.params.pdf;
  fs.readFile(__dirname + filePath, function (err, data) {
    res.contentType("application/pdf");
    res.send(data);
  });
})

// Algebra 1 SOL
app.get("/algebra1", function (req, res) {
  res.render("algebra1");
})
// Algebra 1 Calculator Strategy Videos
app.get("/algebra1calcvids", function (req, res) {
  res.render("algebra1calcvids");
})
// Algebra 1 Song Videos
app.get("/algebra1songvids", function (req, res) {
  res.render("algebra1songvids");
})
// Algebra 1 SAT
app.get("/algebra1sat", function (req, res) {
  res.render("algebra1sat");
})
// Algebra 1 Quizzes
app.get("/algebra1quizzes", function (req, res) {
  res.render("algebra1quizzes");
})

// Geometry SOL
app.get("/geometry", function (req, res) {
  res.render("geometry");
})

// Geometry Videos
app.get("/geometryvids", function (req, res) {
  res.render("geometryvids");
})

// Algebra 2 SOL
app.get("/algebra2", function (req, res) {
  res.render("algebra2");
})
// Algebra 2 Videos
app.get("/algebra2vids", function (req, res) {
  res.render("algebra2vids");
})

// Volunteer Page
app.get("/volunteer", function (req, res) {
  res.render("volunteer");
})

// Admin Upload Page
app.get("/adminupload", isLoggedIn, function (req, res) {
  res.render("adminupload");
})

//Student profile page
app.get("/profile", function (req, res) {
  res.render("profile");
})

// ============
// AUTH ROUTES
// ============

// show register forms
app.get("/register", function(req, res) {
  res.render("register");
});
app.get("/register/:userType", function(req, res) {
  if (req.params.userType == "student") {
    School.find({}, function (err, schools) {
      if (err) {
        console.log(err);
      } else {
        res.render("registerstudent", { schools: schools });
      }
    });
  }
  else {
    res.render("register" + req.params.userType);
  }
});

// handle sign up logic
app.post("/register/:userType", function(req, res) {
  var type = req.params.userType;
  var newUser;
  if (type == "student") {
    Question.find({}, function(err, questions) {
      if (err) {
        console.log(err);
      } else {
        newUser = new Student({
          username: req.body.username,
          school: req.body.school,
          name: req.body.name,
          year: req.body.year,
          past_sat_score: req.body.score,
          last_log_in: Date.now()
        });
        Student.register(newUser, req.body.password, function (err, user) {
          if (err) {
            console.log(err);
            return res.render("register" + type);
          }
          passport.authenticate('student')(req, res, function () {
            insertStudentQs(user._id);
            res.redirect("/");
          });
        });
      }
    })

  }
  else if (type == "admin") {
    newUser = new Admin({ username: req.body.username });
    Admin.register(newUser, req.body.password, function (err, user) {
      if (err) {
        console.log(err);
        return res.render("register" + type);
      }
      passport.authenticate('admin')(req, res, function () {
        res.redirect("/");
      });
    });
  }
  else if (type == "tutor") {
    newUser = new Tutor({ username: req.body.username,
                          name: req.body.name });
    Tutor.register(newUser, req.body.password, function (err, user) {
      if (err) {
        console.log(err);
        return res.render("register" + type);
      }
      passport.authenticate('tutor')(req, res, function () {
        res.redirect("/");
      });
    });
  }
});

// show login forms
app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/login/:userType", function(req, res) {
  res.render("login" + req.params.userType);
});

// handle login logic
app.post("/login/student", passport.authenticate('student',
  { failureRedirect: "/login/student"}),
    function (req, res) {
      var query = {
            'username': req.user.username
        };
        var update = {
            last_log_in: Date.now()
        };
        var options = {
            new: true
        };
        Student.findOneAndUpdate(query, update, options, function(err, user) {
            if (err) {
                console.log(err);
            }
        });
        console.log("Welcome " + req.user.username);
        res.redirect("/");
});

app.post("/login/tutor", passport.authenticate('tutor',
  {
    successRedirect: "/",
    failureRedirect: "/login/tutor"

  }), function (req, res) {
});
app.post("/login/admin", passport.authenticate('admin',
  {
    successRedirect: "/",
    failureRedirect: "/login/admin"

  }), function (req, res) {
});

// logout route
app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

function isLoggedIn(req, res, next) {
  if(req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}


//analytics route
app.get("/analytics", function(req, res) {
    var today = new Date();
    var week = new Date(today.getFullYear(), today.getMonth(), today.getDate()-7);
    var month = new Date(today.getFullYear(), today.getMonth()-1, today.getDate());
    var year = new Date(today.getFullYear()-1, today.getMonth(), today.getDate());

    Promise.all([
        Session.countDocuments({      date: {
        $gt: week,
        $lt: today
            }
       }),
        Session.countDocuments({ date: {
        $gt: month,
        $lt: today
            }
  }),
        Session.countDocuments({ date: {
          $gt: year,
          $lt: today
        }
      }),
        Session.distinct().countDocuments({ date: {
          $gt: week,
          $lt: today
        }
      }),
        Session.distinct().countDocuments({ date: {
          $gt: month,
          $lt: today
        }
      }),
        Session.distinct().countDocuments({ date: {
          $gt: year,
          $lt: today
        }
      })
]).then( ([ weeklyOutput, monthlyOutput , yearlyOutput,
            student_weekly, student_monthly, student_yearly]) => {
  res.render("analytics", {weeklyOutput: weeklyOutput, monthlyOutput: monthlyOutput, yearlyOutput:yearlyOutput,
                           student_weekly: student_weekly, student_monthly: student_monthly, student_yearly: student_yearly});
});

})


app.listen(process.env.PORT || 3000, process.env.IP, function () {
  console.log("Server has started!")
})

//Upload question page
app.get("/questionupload", function (req, res) {
  res.render("questionupload");
})

app.post("/questionupload", bodyParser.urlencoded({extended: true}), function(req, res) {
  var url = req.body.URL;
  parseCSV(url);
  res.redirect("/");
});

//Upload school name page
app.get("/schoolupload", function (req, res) {
  res.render("schoolupload");
})

app.post("/schoolupload", bodyParser.urlencoded({extended: true}), function(req, res) {
  var name = req.body.schoolNAME;
  uploadSchool(name);
  res.redirect("/");
});
