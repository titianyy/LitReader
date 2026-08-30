#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

@interface LitReaderDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@end

@implementation LitReaderDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self buildMenu];

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    configuration.defaultWebpagePreferences.allowsContentJavaScript = YES;
    [configuration.userContentController addScriptMessageHandler:self name:@"doiLookup"];
    NSString *doiBridge =
        @"(() => {"
         "window.__litreaderNativeOwnsDoiLookup = true;"
         "let lastDoi = '', busy = false;"
         "const normalize = value => String(value || '').trim().replace(/^https?:\\/\\/(dx\\.)?doi\\.org\\//i, '');"
         "const valid = doi => /^10\\.\\d{4,9}\\/.+/.test(doi);"
         "const byId = id => document.getElementById(id);"
         "const setStatus = text => { const node = byId('doiStatus'); if (node) node.textContent = text; };"
         "const setButton = loading => { const button = byId('fetchDoi'); if (button) { button.disabled = loading; button.textContent = loading ? 'Looking up…' : 'Retrieve'; } };"
         "const setField = (name, value) => { const field = document.querySelector('[name=\"' + name + '\"]'); if (field && value != null) field.value = String(value); };"
         "const first = value => Array.isArray(value) ? (value[0] || '') : (value || '');"
         "const yearFrom = value => { try { return String(value['date-parts'][0][0] || ''); } catch (_) { return ''; } };"
         "const startLookup = force => {"
           "const input = byId('doiInput') || document.querySelector('[name=\"doi\"]');"
           "if (!input) return;"
           "const doi = normalize(input.value);"
           "if (!valid(doi) || busy || (!force && doi === lastDoi)) return;"
           "input.value = doi; lastDoi = doi; busy = true; setButton(true); setStatus('Searching Crossref and DataCite…');"
           "window.webkit.messageHandlers.doiLookup.postMessage({ id: 'native-' + Date.now(), doi });"
         "};"
         "document.addEventListener('click', event => { const target = event.target; if (target && target.closest && target.closest('#fetchDoi')) { event.preventDefault(); busy = false; lastDoi = ''; startLookup(true); } }, true);"
         "document.addEventListener('keydown', event => { if (event.target && event.target.id === 'doiInput' && event.key === 'Enter') { event.preventDefault(); startLookup(true); } }, true);"
         "setInterval(() => startLookup(false), 500);"
         "window.__litreaderNativeFill = result => {"
           "busy = false; setButton(false);"
           "if (!result || result.error) { setStatus('Lookup failed: ' + ((result && result.error) || 'Unknown error.')); return; }"
           "const data = result.data || {}; let metadata;"
           "if (result.source === 'Crossref') {"
             "const authors = Array.isArray(data.author) ? data.author.map(author => [author.given, author.family].filter(Boolean).join(' ') || author.name).filter(Boolean).join(', ') : '';"
             "const issued = data.issued || data['published-print'] || data['published-online'] || data.created;"
             "metadata = { title: first(data.title), authors, journal: first(data['container-title']) || data.publisher || '', year: yearFrom(issued), url: data.URL || ('https://doi.org/' + normalize(data.DOI)), tags: Array.isArray(data.subject) ? data.subject.slice(0, 6).join(', ') : '' };"
           "} else {"
             "const title = Array.isArray(data.titles) && data.titles[0] ? data.titles[0].title : '';"
             "const authors = Array.isArray(data.creators) ? data.creators.map(author => author.name || [author.givenName, author.familyName].filter(Boolean).join(' ')).filter(Boolean).join(', ') : '';"
             "const subjects = Array.isArray(data.subjects) ? data.subjects.map(subject => subject.subject).filter(Boolean).slice(0, 6).join(', ') : '';"
             "metadata = { title, authors, journal: (data.container && data.container.title) || data.publisher || '', year: data.publicationYear || '', url: data.url || ('https://doi.org/' + normalize(data.doi)), tags: subjects };"
           "}"
           "setField('doi', normalize(data.DOI || data.doi || (byId('doiInput') && byId('doiInput').value)));"
           "setField('title', metadata.title); setField('authors', metadata.authors); setField('journal', metadata.journal); setField('year', metadata.year); setField('url', metadata.url);"
           "const tags = document.querySelector('[name=\"tags\"]'); if (tags && !tags.value && metadata.tags) tags.value = metadata.tags;"
           "setStatus('Retrieved from ' + result.source + '.');"
         "};"
        "})();";
    WKUserScript *bridgeUserScript = [[WKUserScript alloc] initWithSource:doiBridge injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES];
    [configuration.userContentController addUserScript:bridgeUserScript];

    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;

    self.window = [[NSWindow alloc]
        initWithContentRect:NSMakeRect(0, 0, 1280, 820)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable | NSWindowStyleMaskFullSizeContentView
        backing:NSBackingStoreBuffered
        defer:NO];
    self.window.title = @"LitReader";
    self.window.minSize = NSMakeSize(840, 620);
    self.window.contentView = self.webView;
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    NSError *error = nil;
    NSURL *page = [self installBundledPage:&error];
    if (page) {
        [self.webView loadFileURL:page allowingReadAccessToURL:page.URLByDeletingLastPathComponent];
    } else {
        [self showLaunchError:error.localizedDescription ?: @"The bundled page is unavailable."];
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (NSURL *)installBundledPage:(NSError **)error {
    NSURL *bundledPage = [NSBundle.mainBundle URLForResource:@"LitReader" withExtension:@"html"];
    if (!bundledPage) {
        if (error) *error = [NSError errorWithDomain:@"LitReader" code:1 userInfo:@{NSLocalizedDescriptionKey: @"The bundled LitReader page is missing."}];
        return nil;
    }

    NSURL *supportRoot = [[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"LitReader" isDirectory:YES];
    if (![NSFileManager.defaultManager createDirectoryAtURL:supportRoot withIntermediateDirectories:YES attributes:nil error:error]) return nil;

    NSURL *installedPage = [supportRoot URLByAppendingPathComponent:@"LitReader.html"];
    NSData *bundledData = [NSData dataWithContentsOfURL:bundledPage options:0 error:error];
    if (!bundledData) return nil;
    NSData *installedData = [NSData dataWithContentsOfURL:installedPage];
    if (![bundledData isEqualToData:installedData] && ![bundledData writeToURL:installedPage options:NSDataWritingAtomic error:error]) return nil;
    return installedPage;
}

- (void)showLaunchError:(NSString *)message {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"LitReader could not open";
    alert.informativeText = message;
    alert.alertStyle = NSAlertStyleCritical;
    [alert runModal];
    [NSApp terminate:nil];
}

- (void)buildMenu {
    NSMenu *mainMenu = [[NSMenu alloc] init];
    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"About LitReader" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:NSMenuItem.separatorItem];
    [appMenu addItemWithTitle:@"Quit LitReader" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    [mainMenu addItem:appItem];

    NSMenuItem *editItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    NSMenuItem *redo = [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
    redo.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [editMenu addItem:NSMenuItem.separatorItem];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    editItem.submenu = editMenu;
    [mainMenu addItem:editItem];
    NSApp.mainMenu = mainMenu;
}

- (void)webView:(WKWebView *)webView navigationAction:(WKNavigationAction *)navigationAction didBecomeDownload:(WKDownload *)download API_AVAILABLE(macos(11.3)) {
    download.delegate = self;
}

- (void)webView:(WKWebView *)webView navigationResponse:(WKNavigationResponse *)navigationResponse didBecomeDownload:(WKDownload *)download API_AVAILABLE(macos(11.3)) {
    download.delegate = self;
}

- (void)download:(WKDownload *)download decideDestinationUsingResponse:(NSURLResponse *)response suggestedFilename:(NSString *)suggestedFilename completionHandler:(void (^)(NSURL * _Nullable destination))completionHandler API_AVAILABLE(macos(11.3)) {
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.nameFieldStringValue = suggestedFilename;
    panel.canCreateDirectories = YES;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URL : nil);
    }];
}

- (void)webView:(WKWebView *)webView runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSArray<NSURL *> * _Nullable URLs))completionHandler {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
    panel.allowedContentTypes = @[UTTypeJSON];
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URLs : nil);
    }];
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"doiLookup"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *request = (NSDictionary *)message.body;
    NSString *requestID = request[@"id"];
    NSString *doi = request[@"doi"];
    if (requestID.length == 0 || doi.length == 0) return;
    [self retrieveDOI:doi requestID:requestID];
}

- (void)retrieveDOI:(NSString *)doi requestID:(NSString *)requestID {
    NSString *encoded = [doi stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLPathAllowedCharacterSet];
    NSURL *crossrefURL = [NSURL URLWithString:[@"https://api.crossref.org/works/" stringByAppendingString:encoded]];
    [self fetchJSON:crossrefURL completion:^(NSDictionary *json, NSInteger status) {
        NSDictionary *record = [json[@"message"] isKindOfClass:NSDictionary.class] ? json[@"message"] : nil;
        NSArray *titles = [record[@"title"] isKindOfClass:NSArray.class] ? record[@"title"] : nil;
        if (status == 200 && titles.count > 0) {
            [self sendDOIResult:@{ @"id": requestID, @"source": @"Crossref", @"data": record }];
            return;
        }
        NSURL *dataciteURL = [NSURL URLWithString:[@"https://api.datacite.org/dois/" stringByAppendingString:encoded]];
        [self fetchJSON:dataciteURL completion:^(NSDictionary *fallbackJSON, NSInteger fallbackStatus) {
            NSDictionary *data = [fallbackJSON[@"data"] isKindOfClass:NSDictionary.class] ? fallbackJSON[@"data"] : nil;
            NSDictionary *attributes = [data[@"attributes"] isKindOfClass:NSDictionary.class] ? data[@"attributes"] : nil;
            if (fallbackStatus == 200 && attributes.count > 0) {
                [self sendDOIResult:@{ @"id": requestID, @"source": @"DataCite", @"data": attributes }];
            } else {
                [self sendDOIResult:@{ @"id": requestID, @"error": @"No metadata record was found for this DOI." }];
            }
        }];
    }];
}

- (void)fetchJSON:(NSURL *)URL completion:(void (^)(NSDictionary *json, NSInteger status))completion {
    if (!URL) { completion(@{}, 0); return; }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL];
    request.timeoutInterval = 12;
    [request setValue:@"LitReader/1.2 (local scientific reading log)" forHTTPHeaderField:@"User-Agent"];
    NSURLSessionDataTask *task = [NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        NSDictionary *json = nil;
        if (data.length > 0) json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        completion([json isKindOfClass:NSDictionary.class] ? json : @{}, status);
    }];
    [task resume];
}

- (void)sendDOIResult:(NSDictionary *)result {
    NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *script = [NSString stringWithFormat:@"if (window.__litreaderDoiResult) window.__litreaderDoiResult(%@); if (window.__litreaderNativeFill) window.__litreaderNativeFill(%@);", json ?: @"{}", json ?: @"{}"];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:script completionHandler:nil];
    });
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        LitReaderDelegate *delegate = [[LitReaderDelegate alloc] init];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
