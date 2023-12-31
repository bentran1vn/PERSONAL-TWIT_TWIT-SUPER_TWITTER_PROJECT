import { NextFunction, Request, Response } from 'express'
import { ParamSchema, checkSchema } from 'express-validator'
import { JsonWebTokenError } from 'jsonwebtoken'
import { capitalize } from 'lodash'
import { ObjectId } from 'mongodb'
import { UserVerifyStatus } from '~/constants/enums'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { REGEX_USERNAME } from '~/constants/regex'
import MongodbDatabase from '~/database/MongoDbConnection'
import { ErrorWithStatus } from '~/models/Error'
import { TokenPayload } from '~/models/request/Users.request'
import usersServices from '~/services/users.services'
import { hashPassword } from '~/utils/cryto'
import { verifyToken } from '~/utils/jwt'
import { validate } from '~/utils/validation'

const usersServiceInstance = usersServices.getInstance()
const MongoDbInstance = MongodbDatabase.getInstance()

// SchemaParams
const passwordSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
  },
  isString: {
    errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_A_STRING
  },
  trim: true,
  isLength: {
    errorMessage: USERS_MESSAGES.PASSWORD_LENGTH_MUST_BE_FROM_8_TO_50,
    options: { min: 8, max: 50 }
  },
  isStrongPassword: {
    errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_STRONG,
    options: {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1
    }
  }
}

const confirmPasswordSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_IS_REQUIRED
  },
  isString: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_A_STRING
  },
  trim: true,
  isLength: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_LENGTH_MUST_BE_FROM_8_TO_50,
    options: { min: 8, max: 50 }
  },
  isStrongPassword: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_STRONG,
    options: {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1
    }
  },
  custom: {
    options: (value, { req }) => {
      if (value !== req.body.password) {
        throw new Error(USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_THE_SAME_AS_PASSWORD)
      }
      return true
    }
  }
}

const nameSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USERS_MESSAGES.NAME_IS_REQUIRED
  },
  isString: {
    errorMessage: USERS_MESSAGES.NAME_MUST_BE_A_STRING
  },
  trim: true,
  isLength: {
    errorMessage: USERS_MESSAGES.NAME_LENGTH_MUST_BE_FROM_1_TO_100,
    options: {
      min: 1,
      max: 100
    }
  }
}

const dateOfBirthSchema: ParamSchema = {
  isISO8601: {
    errorMessage: USERS_MESSAGES.DATE_OF_BIRTH_BE_ISO8601,
    options: {
      strict: true,
      strictSeparator: true
    }
  }
}

const imageSchema: ParamSchema = {
  optional: true,
  isString: {
    errorMessage: USERS_MESSAGES.IMAGE_URL_MUST_BE_A_STRING
  },
  trim: true,
  isLength: {
    options: {
      min: 1,
      max: 400
    },
    errorMessage: USERS_MESSAGES.IMAGE_URL_LENGTH_MUST_BE_FROM_1_TO_400
  }
}

const userIdSchema: ParamSchema = {
  custom: {
    options: async (value, { req }) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.INVALID_USER_ID,
          status: HTTP_STATUS.NOT_FOUND
        })
      }
      //check in database
      const user = await usersServiceInstance.getUserById(value)
      if (!user) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.INVALID_USER_ID,
          status: HTTP_STATUS.NOT_FOUND
        })
      }
      //pass the check
      return true
    }
  }
}

//// Middleware
export const loginValidator = validate(
  checkSchema(
    {
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        isEmail: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_INVALID
        },
        custom: {
          options: async (value, { req }) => {
            const user = await MongoDbInstance.getUsers().findOne({
              email: value,
              password: hashPassword(req.body.password)
            })
            if (user == null) {
              throw new Error(USERS_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT)
            }
            req.user = user
            return true
          }
        }
      },
      password: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          errorMessage: USERS_MESSAGES.PASSWORD_LENGTH_MUST_BE_FROM_8_TO_50,
          options: { min: 8, max: 50 }
        },
        isStrongPassword: {
          errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_STRONG,
          options: {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1
          }
        }
      }
    },
    ['body']
  )
)

export const registerValidator = validate(
  checkSchema(
    {
      name: nameSchema,
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        isEmail: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_INVALID
        },
        custom: {
          options: async (value, { req }) => {
            const result = await usersServiceInstance.checkEmailService(value)
            if (result) {
              throw new Error(USERS_MESSAGES.EMAIL_ALREADY_EXISTS)
            }
            return true
          }
        }
      },
      password: passwordSchema,
      confirmPassword: confirmPasswordSchema,
      date_of_birth: dateOfBirthSchema
    },
    ['body']
  )
)

export const accessTokenValidator = validate(
  checkSchema(
    {
      Authorization: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            const accessToken = value.split(' ')[1]
            //nếu không có accessToken thì throw error
            if (!accessToken) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.ACCESS_TOKEN_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            try {
              //nếu có accessToken thì kiểm tra accessToken có hợp lệ không
              const decoded_authorization = await verifyToken({
                token: accessToken,
                secretOrPulicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
              })
              //lấy ra decoded_authorization(payload), lưu vào req, để dùng dần
              ;(req as Request).decoded_authorization = decoded_authorization
            } catch (error) {
              throw new ErrorWithStatus({
                message: capitalize((error as JsonWebTokenError).message),
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            return true
          }
        }
      }
    },
    ['headers']
  )
)

export const refreshTokenValidator = validate(
  checkSchema(
    {
      refresh_token: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            //verify refresh token
            try {
              const [decoded_refresh_token, refreshToken] = await Promise.all([
                verifyToken({ token: value, secretOrPulicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string }),
                MongoDbInstance.getRefreshToken().findOne({
                  token: value
                })
              ])
              //tìm refresh token trong database
              if (!refreshToken) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USED_REFRESH_TOKEN_OR_NOT_EXISTS,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              ;(req as Request).decoded_refresh_token = decoded_refresh_token
            } catch (error) {
              if (error instanceof JsonWebTokenError) {
                throw new ErrorWithStatus({
                  message: capitalize((error as JsonWebTokenError).message),
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              throw error
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const emailVerifyTokenValidator = validate(
  checkSchema({
    email_verify_token: {
      trim: true,
      custom: {
        options: async (value: string, { req }) => {
          //kiểm tra người dùng có truyền lên email_verify_token không
          if (!value) {
            throw new ErrorWithStatus({
              message: USERS_MESSAGES.EMAIL_VERIFY_TOKEN_IS_REQUIRED,
              status: HTTP_STATUS.BAD_REQUEST
            })
          }
          //verify email verify token
          try {
            const decoded_email_verify_token = await verifyToken({
              token: value,
              secretOrPulicKey: process.env.JWT_SECRET_EMAIL_VERIFY_TOKEN as string
            })
            //sau khi verify thành công ta được payload
            ;(req as Request).decoded_email_verify_token = decoded_email_verify_token
          } catch (error) {
            if (error instanceof JsonWebTokenError) {
              throw new ErrorWithStatus({
                message: capitalize((error as JsonWebTokenError).message),
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            throw error
          }
          return true
        }
      }
    }
  })
)

export const forgotPasswordValidator = validate(
  checkSchema(
    {
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        isEmail: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_INVALID
        },
        trim: true,
        custom: {
          options: async (value, { req }) => {
            const user = await MongoDbInstance.getUsers().findOne({
              email: value
            })
            if (user == null) {
              throw new Error(USERS_MESSAGES.USER_NOT_FOUND)
            }
            req.user = user
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const verifyForgotPasswordTokenValidator = validate(
  checkSchema({
    forgot_password_token: {
      trim: true,
      custom: {
        options: async (value: string, { req }) => {
          //kiểm tra người dùng có truyền lên email_verify_token không
          if (!value) {
            throw new ErrorWithStatus({
              message: USERS_MESSAGES.FORGOR_PASSWORD_TOKEN_IS_REQUIRED,
              status: HTTP_STATUS.BAD_REQUEST
            })
          }
          //verify email verify token
          try {
            const decoded_forgot_password_token = await verifyToken({
              token: value,
              secretOrPulicKey: process.env.JWT_SECRET_FORGOR_PASSWORD_TOKEN as string
            })
            //sau khi verify thành công ta được payload
            ;(req as Request).decoded_forgot_password_token = decoded_forgot_password_token
            const { user_id } = decoded_forgot_password_token
            const user = await usersServiceInstance.getUserById(user_id)
            //nếu mà không có user thì báo lỗi
            if (!user) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS.NOT_FOUND
              })
            }
            if (user.forgot_password_token !== value) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.FORGOR_PASSWORD_TOKEN_IS_INCORRECT,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
          } catch (error) {
            if (error instanceof JsonWebTokenError) {
              throw new ErrorWithStatus({
                message: capitalize((error as JsonWebTokenError).message),
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            throw error
          }
          return true
        }
      }
    }
  })
)

export const resetPasswordValidator = validate(
  checkSchema(
    {
      password: passwordSchema,
      confirmPassword: confirmPasswordSchema
    },
    ['body']
  )
)

export const verifiedUserValidator = (req: Request, res: Response, next: NextFunction) => {
  const { verify } = req.decoded_authorization as TokenPayload
  if (verify !== UserVerifyStatus.Verified) {
    next(
      new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_VERIFIED,
        status: HTTP_STATUS.FORBIDDEN
      })
    )
  }
  next()
}

export const updateMeValidator = validate(
  checkSchema(
    {
      name: {
        optional: true,
        ...nameSchema,
        notEmpty: undefined
      },
      date_of_birth: {
        optional: true,
        ...dateOfBirthSchema,
        notEmpty: undefined
      },
      bio: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.BIO_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.BIO_LENGTH_MUST_BE_LESS_THAN_200
        }
      },
      //giống bio
      location: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.LOCATION_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.LOCATION_LENGTH_MUST_BE_LESS_THAN_200
        }
      },
      //giống location
      website: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.WEBSITE_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },

          errorMessage: USERS_MESSAGES.WEBSITE_LENGTH_MUST_BE_LESS_THAN_200
        }
      },
      username: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.USERNAME_MUST_BE_A_STRING
        },
        trim: true,
        custom: {
          options: async (value, { req }) => {
            if (REGEX_USERNAME.test(value) === false) {
              throw new Error(USERS_MESSAGES.USERNAME_MUST_BE_A_STRING)
            }
            const user = await usersServiceInstance.getUserByUsername(value)
            if (user) {
              throw new Error(USERS_MESSAGES.USERNAME_ALREADY_EXISTS)
            }
            return true
          }
        }
      },
      avatar: imageSchema,
      cover_photo: imageSchema
    },
    ['body']
  )
)

export const followValidator = validate(
  checkSchema(
    {
      followed_user_id: userIdSchema
    },
    ['body']
  )
)

export const unfollowValidator = validate(
  checkSchema(
    {
      followed_user_id: userIdSchema
    },
    ['params']
  )
)

export const changePasswordValidator = validate(
  checkSchema(
    {
      old_password: {
        ...passwordSchema,
        custom: {
          options: async (value, { req }) => {
            const { user_id } = req.decoded_authorization as TokenPayload
            const user = await usersServiceInstance.getUserById(user_id)
            if (!user) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS.NOT_FOUND
              })
            }
            const { password } = user
            if (password !== hashPassword(value)) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.OLD_PASSWORD_IS_INCORRECT,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            return true
          }
        }
      },
      password: passwordSchema,
      confirm_password: confirmPasswordSchema
    },
    ['body']
  )
)
