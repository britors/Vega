cmake_minimum_required(VERSION 3.22)
project(lyra-vega-qt VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

include(CTest)
find_package(Qt6 6.4 REQUIRED COMPONENTS Core DBus Network Widgets)

set(VEGA_DBUS_XML
    ${CMAKE_CURRENT_SOURCE_DIR}/../dbus/org.lyraos.Vega1.Logs.xml
    ${CMAKE_CURRENT_SOURCE_DIR}/../dbus/org.lyraos.Vega1.System.xml
)
qt_add_dbus_interfaces(VEGA_DBUS_SOURCES ${VEGA_DBUS_XML})

add_library(vegaqt_core STATIC
    src/audit.cpp
    src/audit.h
    src/dbusclient.cpp
    src/dbusclient.h
    src/mainwindow.cpp
    src/mainwindow.h
    src/secretstore.cpp
    src/secretstore.h
    ${VEGA_DBUS_SOURCES}
)
target_link_libraries(vegaqt_core PUBLIC Qt6::Core Qt6::DBus Qt6::Network Qt6::Widgets)
target_include_directories(vegaqt_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_definitions(vegaqt_core PUBLIC
    VEGA_QT_VERSION="${PROJECT_VERSION}"
    QT_NO_CAST_FROM_ASCII
)
target_compile_options(vegaqt_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(lyra-vega-qt src/main.cpp resources/resources.qrc)
target_link_libraries(lyra-vega-qt PRIVATE vegaqt_core)

install(TARGETS lyra-vega-qt RUNTIME DESTINATION bin)
install(FILES packaging/org.lyraos.VegaQt.desktop DESTINATION share/applications)
install(FILES packaging/org.lyraos.VegaQt.metainfo.xml DESTINATION share/metainfo)
install(FILES packaging/org.lyraos.VegaQt.svg DESTINATION share/icons/hicolor/scalable/apps)

if(BUILD_TESTING)
    find_package(Qt6 6.4 REQUIRED COMPONENTS Test)
    add_executable(vegaqt_tests tests/test_core.cpp)
    target_link_libraries(vegaqt_tests PRIVATE vegaqt_core Qt6::Test)
    target_compile_definitions(vegaqt_tests PRIVATE VEGA_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/..")
    add_test(NAME vegaqt_tests COMMAND vegaqt_tests -platform offscreen)
    set_tests_properties(vegaqt_tests PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endif()
