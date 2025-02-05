//
//  TraveLogApp.swift
//  TraveLog
//
//  Created by 西村光篤 on 2025/02/05.
//

import SwiftUI

@main
struct TraveLogApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
