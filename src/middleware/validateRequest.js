import ApiError from "../utils/ApiError.js";

const validateRequest = (validator, statusCode = 422) => (req, res, next) => {
  const { errors, values } = validator(req.body);

  if (Object.keys(errors).length > 0) {
    return next(new ApiError(statusCode, "Validation failed", errors));
  }

  req.validatedBody = values;
  return next();
};

export default validateRequest;
