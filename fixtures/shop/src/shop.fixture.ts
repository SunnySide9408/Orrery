import {
  edgeId,
  nodeId,
  regionId,
  type AnalysisResult,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
  type Region,
} from '@orrery/contracts';

/**
 * A hand-written analysis result for a small, imaginary Angular shop: an app
 * shell, `core` and `shared` folders, and three lazy features (catalog,
 * checkout, account). It has the exact shape the real analyser will return,
 * so the scene can be built and tested before the analyser exists.
 *
 * `AuthService` is deliberately shared across all three lazy features: it
 * drives the Phase 0 "click AuthService, its dependants light up" moment.
 */

const APP = regionId('folder', 'src/app');
const CORE = regionId('folder', 'src/app/core');
const SHARED = regionId('folder', 'src/app/shared');
const CATALOG = regionId('lazy-route', 'src/app/features/catalog');
const CHECKOUT = regionId('lazy-route', 'src/app/features/checkout');
const ACCOUNT = regionId('lazy-route', 'src/app/features/account');

const regions: Region[] = [
  { id: APP, label: 'app', kind: 'folder', rootPath: 'src/app' },
  { id: CORE, label: 'core', kind: 'folder', rootPath: 'src/app/core', parentId: APP },
  { id: SHARED, label: 'shared', kind: 'folder', rootPath: 'src/app/shared', parentId: APP },
  {
    id: CATALOG,
    label: 'catalog',
    kind: 'lazy-route',
    rootPath: 'src/app/features/catalog',
    parentId: APP,
  },
  {
    id: CHECKOUT,
    label: 'checkout',
    kind: 'lazy-route',
    rootPath: 'src/app/features/checkout',
    parentId: APP,
  },
  {
    id: ACCOUNT,
    label: 'account',
    kind: 'lazy-route',
    rootPath: 'src/app/features/account',
    parentId: APP,
  },
];

const nodes: GraphNode[] = [];

/** Adds a node and returns its ID. */
function node(
  path: string,
  name: string,
  kind: NodeKind,
  region: string,
  linesOfCode: number,
  ownerId?: string,
): string {
  const id = nodeId(path);
  nodes.push({ id, path, name, kind, regionId: region, metrics: { linesOfCode }, ownerId });
  return id;
}

// App shell
const app = node('src/app/app.ts', 'App', 'component', APP, 24);
const appRoutes = node('src/app/app.routes.ts', 'routes', 'route-config', APP, 31);
const appConfig = node('src/app/app.config.ts', 'appConfig', 'other', APP, 14);
const header = node('src/app/header.ts', 'Header', 'component', APP, 48);
const notFound = node('src/app/not-found.ts', 'NotFound', 'component', APP, 12);
const appSpec = node('src/app/app.spec.ts', 'App spec', 'spec', APP, 22, app);

// core
const auth = node('src/app/core/auth.service.ts', 'AuthService', 'service', CORE, 96);
const authGuard = node('src/app/core/auth.guard.ts', 'authGuard', 'guard', CORE, 18);
const authInterceptor = node(
  'src/app/core/auth.interceptor.ts',
  'authInterceptor',
  'interceptor',
  CORE,
  21,
);
const api = node('src/app/core/api.service.ts', 'ApiService', 'service', CORE, 64);
const session = node('src/app/core/session.store.ts', 'SessionStore', 'service', CORE, 52);
const logger = node('src/app/core/logger.service.ts', 'LoggerService', 'service', CORE, 27);
const authSpec = node(
  'src/app/core/auth.service.spec.ts',
  'AuthService spec',
  'spec',
  CORE,
  74,
  auth,
);

// shared
const button = node('src/app/shared/button.ts', 'Button', 'component', SHARED, 30);
const card = node('src/app/shared/card.ts', 'Card', 'component', SHARED, 26);
const spinner = node('src/app/shared/spinner.ts', 'Spinner', 'component', SHARED, 15);
const price = node('src/app/shared/price.pipe.ts', 'PricePipe', 'pipe', SHARED, 19);
const autofocus = node('src/app/shared/autofocus.ts', 'Autofocus', 'directive', SHARED, 17);

// catalog (lazy)
const catalogRoutes = node(
  'src/app/features/catalog/catalog.routes.ts',
  'CATALOG_ROUTES',
  'route-config',
  CATALOG,
  20,
);
const catalogPage = node(
  'src/app/features/catalog/catalog-page.ts',
  'CatalogPage',
  'component',
  CATALOG,
  58,
);
const productCard = node(
  'src/app/features/catalog/product-card.ts',
  'ProductCard',
  'component',
  CATALOG,
  41,
);
const productDetail = node(
  'src/app/features/catalog/product-detail.ts',
  'ProductDetail',
  'component',
  CATALOG,
  77,
);
const productService = node(
  'src/app/features/catalog/product.service.ts',
  'ProductService',
  'service',
  CATALOG,
  45,
);
const productResolver = node(
  'src/app/features/catalog/product.resolver.ts',
  'productResolver',
  'resolver',
  CATALOG,
  16,
);
const wishlistButton = node(
  'src/app/features/catalog/wishlist-button.ts',
  'WishlistButton',
  'component',
  CATALOG,
  34,
);
const catalogPageSpec = node(
  'src/app/features/catalog/catalog-page.spec.ts',
  'CatalogPage spec',
  'spec',
  CATALOG,
  40,
  catalogPage,
);

// checkout (lazy)
const checkoutRoutes = node(
  'src/app/features/checkout/checkout.routes.ts',
  'CHECKOUT_ROUTES',
  'route-config',
  CHECKOUT,
  22,
);
const cartPage = node(
  'src/app/features/checkout/cart-page.ts',
  'CartPage',
  'component',
  CHECKOUT,
  62,
);
const cartItem = node(
  'src/app/features/checkout/cart-item.ts',
  'CartItem',
  'component',
  CHECKOUT,
  38,
);
const checkoutPage = node(
  'src/app/features/checkout/checkout-page.ts',
  'CheckoutPage',
  'component',
  CHECKOUT,
  88,
);
const cartService = node(
  'src/app/features/checkout/cart.service.ts',
  'CartService',
  'service',
  CHECKOUT,
  71,
);
const paymentService = node(
  'src/app/features/checkout/payment.service.ts',
  'PaymentService',
  'service',
  CHECKOUT,
  55,
);
const cartServiceSpec = node(
  'src/app/features/checkout/cart.service.spec.ts',
  'CartService spec',
  'spec',
  CHECKOUT,
  63,
  cartService,
);

// account (lazy)
const accountRoutes = node(
  'src/app/features/account/account.routes.ts',
  'ACCOUNT_ROUTES',
  'route-config',
  ACCOUNT,
  24,
);
const loginPage = node(
  'src/app/features/account/login-page.ts',
  'LoginPage',
  'component',
  ACCOUNT,
  66,
);
const profilePage = node(
  'src/app/features/account/profile-page.ts',
  'ProfilePage',
  'component',
  ACCOUNT,
  54,
);
const ordersPage = node(
  'src/app/features/account/orders-page.ts',
  'OrdersPage',
  'component',
  ACCOUNT,
  47,
);
const orderList = node(
  'src/app/features/account/order-list.ts',
  'OrderList',
  'component',
  ACCOUNT,
  39,
);
const accountService = node(
  'src/app/features/account/account.service.ts',
  'AccountService',
  'service',
  ACCOUNT,
  50,
);
const loginPageSpec = node(
  'src/app/features/account/login-page.spec.ts',
  'LoginPage spec',
  'spec',
  ACCOUNT,
  58,
  loginPage,
);

const edges: GraphEdge[] = [];

/** `source` depends on `target`; `line` is where `source` says so. */
function edge(kind: EdgeKind, source: string, target: string, line: number): void {
  edges.push({
    id: edgeId(kind, source, target),
    sourceId: source,
    targetId: target,
    kind,
    evidence: [{ path: source, line }],
  });
}

/** Plain imports, one per target, numbered from line 1 like an import block. */
function imports(source: string, ...targets: string[]): void {
  targets.forEach((target, index) => edge('import', source, target, index + 1));
}

/** A standalone component's `imports: [...]` array, written at `line`. */
function standaloneImports(source: string, line: number, ...targets: string[]): void {
  for (const target of targets) {
    edge('standalone-import', source, target, line);
  }
}

// App shell
imports(app, header);
standaloneImports(app, 8, header);
imports(appRoutes, notFound, authGuard);
edge('lazy-route', appRoutes, catalogRoutes, 9);
edge('lazy-route', appRoutes, checkoutRoutes, 14);
edge('lazy-route', appRoutes, accountRoutes, 20);
imports(appConfig, appRoutes, authInterceptor, logger);
imports(header, auth, session, button);
standaloneImports(header, 9, button);
imports(notFound, button);
standaloneImports(notFound, 6, button);
imports(appSpec, app);

// core
imports(auth, api, session, logger);
imports(authGuard, auth);
imports(authInterceptor, auth, logger);
imports(api, logger);
imports(session, logger);
imports(authSpec, auth, api);

// catalog
imports(catalogRoutes, catalogPage, productDetail, productResolver);
imports(catalogPage, productService, productCard, spinner);
standaloneImports(catalogPage, 12, productCard, spinner);
imports(productCard, card, price, wishlistButton);
standaloneImports(productCard, 10, card, price, wishlistButton);
imports(productDetail, productService, cartService, auth, price, button);
standaloneImports(productDetail, 14, price, button);
imports(productService, api);
imports(productResolver, productService);
imports(wishlistButton, auth, button);
standaloneImports(wishlistButton, 7, button);
imports(catalogPageSpec, catalogPage, productService);

// checkout
imports(checkoutRoutes, cartPage, checkoutPage, authGuard);
imports(cartPage, cartService, cartItem, button);
standaloneImports(cartPage, 11, cartItem, button);
imports(cartItem, price, button);
standaloneImports(cartItem, 8, price, button);
imports(checkoutPage, cartService, paymentService, auth, price, button, autofocus);
standaloneImports(checkoutPage, 16, price, button, autofocus);
imports(cartService, api, session);
imports(paymentService, api, auth, logger);
imports(cartServiceSpec, cartService, api);

// account
imports(accountRoutes, loginPage, profilePage, ordersPage, authGuard);
imports(loginPage, auth, button, autofocus);
standaloneImports(loginPage, 10, button, autofocus);
imports(profilePage, accountService, auth, card, button);
standaloneImports(profilePage, 12, card, button);
imports(ordersPage, accountService, orderList, spinner);
standaloneImports(ordersPage, 9, orderList, spinner);
imports(orderList, price, card);
standaloneImports(orderList, 7, price, card);
imports(accountService, api, auth);
imports(loginPageSpec, loginPage, auth);

export const shopFixture: AnalysisResult = {
  schemaVersion: 1,
  project: { name: 'shop (fixture)' },
  ref: 'fixture',
  analyzerVersion: 'hand-written',
  createdAt: '2026-10-23T00:00:00Z',
  graph: { regions, nodes, edges },
  findings: [],
  unresolved: [
    {
      kind: 'import',
      location: { path: 'src/app/features/checkout/payment.service.ts', line: 4 },
      specifier: '@env/payment-keys',
      reason: 'Path alias "@env/*" is not defined in tsconfig.json.',
    },
  ],
};
