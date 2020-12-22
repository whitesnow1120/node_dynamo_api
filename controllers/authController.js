const awsConfig = require("../config/dynamodb");
const uuid = require("uuid");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mailgun = require("mailgun-js");
const DOMAIN = "sandbox782a117890714e45bbd422d474d26731.mailgun.org";
const mg = mailgun({ apiKey: process.env.MAILGUN_APIKEY, domain: DOMAIN });

const dynamodb = awsConfig.dynamodb;
const docClient = awsConfig.docClient;
const tableName = "Users";
const key = "authentication";
const digitCodeCount = 6;

/**
 * create table (Users)
 */
const createAuthTable = () => {
  try {
    const tablePromise = dynamodb
      .listTables({})
      .promise()
      .then((data) => {
        const exists =
          data.TableNames.filter((name) => {
            return name === tableName;
          }).length > 0;
        if (exists) {
          return Promise.resolve();
        } else {
          const params = {
            TableName: tableName,
            KeySchema: [
              { AttributeName: "email", KeyType: "HASH" }, // partition key
            ],
            AttributeDefinitions: [
              { AttributeName: "email", AttributeType: "S" },
            ],
            ProvisionedThroughput: {
              ReadCapacityUnits: 10,
              WriteCapacityUnits: 10,
            },
          };

          return dynamodb.createTable(params, function (err, data) {});
        }
      });
  } catch (err) {
    console.log(err);
  }
};

/**
 * generate hashed password (sha512)
 * @param { string } password 
 */
const generateHashdPassword = (password) => {
  const hash = crypto.createHmac("sha512", key);
  hash.update(password);
  return hash.digest("hex").toString();
};

/**
 * generate random digit code
 * @param { number } n 
 */
const randomDigitCode = (n) => {
  return Math.floor(Math.pow(10, n-1) + Math.random() * 9 * Math.pow(10, n-1));
}

/**
 * registration
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const registration = (req, res) => {
  try {
    const params = {
      TableName: tableName,
      Key: {
        email: req.body.email,
      },
    };

    // check email is exist or not
    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item == undefined) {
          // create hash password
          const name = req.body.name;
          const email = req.body.email;
          const password = generateHashdPassword(req.body.password);

          const token = jwt.sign(
            { name, email, password },
            process.env.JWT_ACC_ACTIVE,
            { expiresIn: "20m" },
          );

          const data = {
            from: "noreply@hello.com",
            to: email,
            subject: "Account Activiation Link",
            html: `
              <h2>Please click on given link to activate your account</h2>
              <p>${process.env.CLIENT_URL}/auth/activate/${token}</p>
            `,
          };
          sendMail(data, res);
        } else {
          res.status(400).json({
            result: "Account exists",
          });
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * send email to the user
 * @param {*} data
 * @param {*} res
 */
const sendMail = (data, res) => {
  mg.messages().send(data, function (err, body) {
    if (err) {
      return res.status(403).json({ result: "Email sending Error" });
    }
    return res.status(200).json({ result: "Email has been sent" });
  });
};

/**
 * activate account (simply click on the given link)
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const activateAccount = (req, res) => {
  try {
    const token = req.url.split("/")[2];
    if (token) {
      jwt.verify(
        token,
        process.env.JWT_ACC_ACTIVE,
        function (err, decodedToken) {
          if (err) {
            return res
              .status(400)
              .json({ result: "Incorrect or Expired Link" });
          }
          const { name, email, password } = decodedToken;
          const paramsWrite = {
            TableName: tableName,
            Item: {
              uid: uuid.v1(),
              email: email,
              name: name,
              password: password,
              createdAt: Date().toString(),
              updatedAt: Date().toString(),
              authtoken: token,
            },
          };

          docClient.put(paramsWrite, function (err, data) {
            if (err) {
              res.status(403).json({ result: "Invalid credentail" });
            } else {
              res.status(200).json({ result: "Activated" });
            }
          });
        },
      );
    }
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * login
 * @param {*} req
 * @param {*} res
 * @method GET
 */
const login = (req, res) => {
  try {
    const hashed_password = generateHashdPassword(req.query.password);

    const params = {
      TableName: tableName,
      Key: {
        email: req.query.email,
      },
    };

    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item == undefined) {
          res
            .status(400)
            .json({ result: "User with this account does not exist" });
        } else {
          if (hashed_password === data.Item.password) {
            res.status(200).send({
              userId: data.Item.uid,
              name: data.Item.name,
              createdAt: data.Item.createdAt,
              updatedAt: data.Item.updatedAt,
            });
          } else {
            res.status(403).json({
              result: "Credentials are incorrect",
            });
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * Generate a reset password token and send email to the user
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const forgotPassword = (req, res) => {
  try {
    const email = req.body.email;
    let params = {
      TableName: tableName,
      Key: {
        email: email,
      },
    };

    // check email is exist or not
    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item != undefined) {
          const token = randomDigitCode(digitCodeCount);
          const emailData = {
            from: "noreply@hello.com",
            to: email,
            subject: "6 digit code",
            html: `<p>${token}</p>`,
          };
          // update user (token)
          params = {
            TableName: tableName,
            Key: {
              email: email,
            },
            UpdateExpression: "set authtoken = :authtoken, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":authtoken": token,
              ":updatedAt": Date().toString(),
            },
            ReturnValues: "UPDATED_NEW",
          };

          docClient.update(params, function (err, data) {
            if (err) {
              res.status(err.statusCode).json({ error: err.message });
            } else {
              sendMail(emailData, res);
            }
          });
        } else {
          res.status(400).json({
            result: "User with this email doesn't exist",
          });
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * reset the password
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const resetPassword = (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    // get token and updatedAt in db
    let params = {
      TableName: tableName,
      Key: {
        email: email,
      },
    };

    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item == undefined) {
          res
            .status(400)
            .json({ result: "User with this account does not exist" });
        } else {
          const lastUpdatedAt = new Date(data.Item.updatedAt)
          const diffSeconds = (new Date().getTime() - lastUpdatedAt.getTime()) / 1000;
          if (token != data.Item.authtoken) {
            res.status(400).json({ result: "Invalid token"});
          } else if (diffSeconds > 1200) { // expire time is "20m"
            res.status(400).json({ result: "Token is expired"});
          } else {
            params = {
              TableName: tableName,
              Key: {
                email: email,
              },
              UpdateExpression:
                "set password = :password, updatedAt=:updatedAt, authtoken=:authtoken",
              ExpressionAttributeValues: {
                ":password": generateHashdPassword(newPassword),
                ":updatedAt": Date().toString(),
                ":authtoken": "",
              },
              ReturnValues: "UPDATED_NEW",
            };

            docClient.update(params, function (err, data) {
              if (err) {
                res.status(err.statusCode).json({ error: err.message });
              } else {
                res.status(200).json({ result: "Password is changed" });
              }
            });
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

module.exports = {
  createAuthTable,
  registration,
  forgotPassword,
  login,
  activateAccount,
  resetPassword,
};
