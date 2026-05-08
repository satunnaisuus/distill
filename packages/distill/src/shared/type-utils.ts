export type IsAny<TValue> = 0 extends 1 & TValue ? true : false;

export type IfNever<TValue, TWhenNever, TWhenPresent> = [TValue] extends [never] ? TWhenNever : TWhenPresent;

export type HasTrue<TValue> = Extract<TValue, true> extends never ? false : true;

export type ValidationErrorIf<TCondition extends boolean, TError> = [TCondition] extends [true] ? TError : {};

export type ValidationErrorUnlessNever<TValue, TError> = IfNever<TValue, {}, TError>;

export type TupleError<TTuple extends readonly unknown[], TError> = number extends TTuple["length"] ? TError : {};

export type IsExact<TActual, TExpected> =
    IsAny<TActual> extends true
        ? IsAny<TExpected>
        : IsAny<TExpected> extends true
          ? false
          : [TActual, TExpected] extends [TExpected, TActual]
            ? true
            : false;

export type IsUnion<TValue, TUnion = TValue> =
    IsAny<TValue> extends true ? false : TValue extends unknown ? ([TUnion] extends [TValue] ? false : true) : false;
