#!/bin/bash

echo "🚀 プロジェクトの規模を選択してください:"
echo "1) 小規模 (Small) - 1ペライチの簡単な設計書のみ"
echo "2) 中・大規模 (Standard) - 詳細なフルセット設計書"
read -p "番号を入力 (1 or 2): " size

if [ "$size" == "1" ]; then
    # 小規模が選ばれたら、standardを消してsmallの中身を外に出す
    rm -rf docs/standard
    mv docs/small/* docs/
    rm -rf docs/small
    echo "✅ 小規模プロジェクト用のドキュメントをセットアップしました！"
elif [ "$size" == "2" ]; then
    # 中規模が選ばれたら、smallを消してstandardの中身を外に出す
    rm -rf docs/small
    mv docs/standard/* docs/
    rm -rf docs/standard
    echo "✅ 中・大規模プロジェクト用のドキュメントをセットアップしました！"
else
    echo "❌ 1 か 2 を入力してください。終了します。"
    exit 1
fi

# 用済みのセットアップスクリプト自身を削除（クリーンにするため）
rm -- "$0"

echo "🎉 セットアップ完了！さあ、開発を始めましょう。"