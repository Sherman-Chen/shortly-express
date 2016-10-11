var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var sessions = require('express-session');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();
var sess;

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(sessions({secret: '1234'}));
app.use(passport.initialize());
app.use(passport.session());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

var GithubStrategy = require('passport-github').Strategy;

passport.use(new GithubStrategy({
  clientID: 'cbe8c116b2484ff27419',
  clientSecret: '6569afb5172d6c691216d54b1e8ddcd3635a1094',
  callbackURL: 'http://localhost:30000/auth/github/callback'
},
  function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

var authenticate = function(req, res, next) {
  sess = req.session;
  if (sess.isLoggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
};


app.get('/', passport.authenticate('github'), 
function(req, res) {
  res.render('index');
});

app.get('/create', 
function(req, res) {
  res.render('index');
});

app.get('/links', 
function(req, res) {
  Links.reset().fetch().then(function(links) {
    var filteredLinks = links.models.filter(function(link) {
      return link.attributes.userId === req.session.userId;
    });
    res.status(200).send(filteredLinks);
  });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri, userId: req.session.userId }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin,
          userId: req.session.userId
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  var request = req.body;

  new User({ username: request.username }).fetch().then(function(found) {
    if (found) {
      bcrypt.compare(request.password, found.attributes.password, function(err, response) {
        if (response) {
          sess = req.session;
          sess.userId = found.attributes.id;
          sess.isLoggedIn = true;
          res.json({url: '/' });       
        } else {
          res.json({err: 1});
        }
      });
    } else {
      res.json({err: 1});
    }
  });
/* 
bcrypt.compare("bacon", hash, function(err, res) {
    // res == true
});
*/


});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', (req, res) => {
  var request = req.body;

  new User({ username: request.username }).fetch().then(function(found) {
    if (found) {
      res.redirect('/signup');
    } else {
      bcrypt.hash(request.password, null, null, function(err, hash) {
        if (err) {
          console.log(err);
        } else {
          var user = new User({
            username: request.username,
            password: hash
          });

          user.save().then(function(user) {
            sess = req.session;
            sess.userId = user.attributes.id;
            sess.isLoggedIn = true;
            res.redirect('/');    
          });
        }
      });

    }
  });

});

app.get('/logout', (req, res) => {
  sess = req.session;
  sess.isLoggedIn = null;
  sess.userId = null;
  res.end('/login'); 
});
/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0], userId: req.session.userId }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
