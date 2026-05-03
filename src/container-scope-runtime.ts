import type { AnyBinding } from "./bind";
import { disposeScope } from "./disposal";
import type { RuntimePublicAccess } from "./module-container-runtime";
import {
    assertScopeIsActive,
    createRuntimeScope,
    defaultModuleContextId,
    type ResolveOptions,
    type RuntimeBinding,
    type RuntimeScope,
} from "./runtime";
import type { AnyToken, TokenValue } from "./token";
import { isRuntimeMultiToken, tokenDisplayKey, tokenRuntimeId } from "./token";

export type RuntimeContainer = {
    resolve<TToken extends AnyToken>(token: TToken): TokenValue<TToken>;
    resolveAll<TToken extends AnyToken>(token: TToken): Array<TokenValue<TToken>>;
    createScope(...bindings: readonly AnyBinding[]): RuntimeContainer;
    runScoped<TResult>(
        bindings: readonly AnyBinding[],
        callback: (scope: RuntimeContainer) => TResult,
    ): Promise<Awaited<TResult>>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};

type RegisterBindingsOptions = {
    readonly moduleContextId?: number;
};

type RegisterBindingsForScope = (
    scope: RuntimeScope,
    bindings: readonly AnyBinding[],
    options?: RegisterBindingsOptions,
) => readonly RuntimeBinding[];

type ResolveActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId?: number,
) => TokenValue<TToken>;

type ResolveAllActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    moduleContextId?: number,
) => Array<TokenValue<TToken>>;

type RuntimeContainerScopeOptions = {
    readonly registerBindings: RegisterBindingsForScope;
    readonly resolveActual: ResolveActual;
    readonly resolveAllActual: ResolveAllActual;
};

export const isMultiToken = (currentToken: AnyToken): boolean => {
    return isRuntimeMultiToken(currentToken);
};

export const assertSingleTokenKey = (tokenKey: string, currentToken: AnyToken): void => {
    if (isMultiToken(currentToken)) {
        throw new Error(`Multibind token "${tokenKey}" must be resolved with resolveAll`);
    }
};

export const assertMultiTokenKey = (tokenKey: string, currentToken: AnyToken): void => {
    if (!isMultiToken(currentToken)) {
        throw new Error(`Token "${tokenKey}" is not a multibind token`);
    }
};

const extendRuntimePublicAccess = (
    scope: RuntimeScope,
    publicAccess: RuntimePublicAccess | undefined,
    bindings: readonly AnyBinding[],
): RuntimePublicAccess | undefined => {
    if (!publicAccess) {
        return undefined;
    }

    const singleTokenIds = new Set(publicAccess.singleTokenIds);
    const multiTokenIds = new Set(publicAccess.multiTokenIds);

    for (const binding of bindings) {
        scope.context.assertTokenIsInTokenList(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);

        if (isMultiToken(binding.token)) {
            multiTokenIds.add(bindingTokenId);
        } else {
            singleTokenIds.add(bindingTokenId);
        }
    }

    return {
        moduleContextId: publicAccess.moduleContextId,
        singleTokenIds,
        multiTokenIds,
    };
};

const assertPublicSingleTokenId = (
    publicAccess: RuntimePublicAccess | undefined,
    tokenId: string,
    tokenKey: string,
): void => {
    if (publicAccess && !publicAccess.singleTokenIds.has(tokenId)) {
        throw new Error(`Service "${tokenKey}" is not exported by the module`);
    }
};

const assertPublicMultiTokenId = (
    publicAccess: RuntimePublicAccess | undefined,
    tokenId: string,
    tokenKey: string,
): void => {
    if (publicAccess && !publicAccess.multiTokenIds.has(tokenId)) {
        throw new Error(`Multibind token "${tokenKey}" is not exported by the module`);
    }
};

const collectRunScopedError = (errors: unknown[], error: unknown): void => {
    if (error instanceof AggregateError) {
        errors.push(...error.errors);
        return;
    }

    errors.push(error);
};

const runScopedCallback = async <TResult>(
    scopedContainer: RuntimeContainer,
    callback: (scope: RuntimeContainer) => TResult,
): Promise<Awaited<TResult>> => {
    let callbackResult: Awaited<TResult> | undefined;
    let callbackError: unknown;
    let callbackFailed = false;

    try {
        callbackResult = (await callback(scopedContainer)) as Awaited<TResult>;
    } catch (error) {
        callbackFailed = true;
        callbackError = error;
    }

    try {
        await scopedContainer.dispose();
    } catch (disposeError) {
        if (callbackFailed) {
            const errors: unknown[] = [];

            collectRunScopedError(errors, callbackError);
            collectRunScopedError(errors, disposeError);

            throw new AggregateError(errors, "Scoped callback and dispose failed");
        }

        throw disposeError;
    }

    if (callbackFailed) {
        throw callbackError;
    }

    return callbackResult as Awaited<TResult>;
};

export const createRuntimeContainerForScope = (
    scope: RuntimeScope,
    options: RuntimeContainerScopeOptions,
    publicAccess?: RuntimePublicAccess,
): RuntimeContainer => {
    const moduleContextId = publicAccess?.moduleContextId ?? defaultModuleContextId;
    const createChildContainer = (bindings: readonly AnyBinding[]): RuntimeContainer => {
        assertScopeIsActive(scope);

        const childScope = createRuntimeScope(scope.context, scope);
        options.registerBindings(
            childScope,
            bindings,
            publicAccess ? { moduleContextId: publicAccess.moduleContextId } : undefined,
        );
        scope.children.add(childScope);

        return createRuntimeContainerForScope(
            childScope,
            options,
            extendRuntimePublicAccess(childScope, publicAccess, bindings),
        );
    };

    return {
        get disposed() {
            return scope.disposed;
        },
        resolve(currentToken) {
            scope.context.assertTokenIsInTokenList(currentToken);
            const currentTokenKey = tokenDisplayKey(currentToken);
            assertSingleTokenKey(currentTokenKey, currentToken);
            assertPublicSingleTokenId(publicAccess, tokenRuntimeId(currentToken), currentTokenKey);
            return options.resolveActual(scope, currentToken, undefined, moduleContextId);
        },
        resolveAll(currentToken) {
            scope.context.assertTokenIsInTokenList(currentToken);
            const currentTokenKey = tokenDisplayKey(currentToken);
            assertMultiTokenKey(currentTokenKey, currentToken);
            assertPublicMultiTokenId(publicAccess, tokenRuntimeId(currentToken), currentTokenKey);
            return options.resolveAllActual(scope, currentToken, moduleContextId);
        },
        createScope(...bindings) {
            return createChildContainer(bindings);
        },
        runScoped(bindings, callback) {
            return runScopedCallback(createChildContainer(bindings), callback);
        },
        dispose() {
            return disposeScope(scope);
        },
    };
};
